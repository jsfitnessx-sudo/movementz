const USDA_API_KEY = process.env.FOODDATA_CENTRAL_API_KEY || process.env.FDC_API_KEY || "DEMO_KEY";

const nutrientNumbers = {
  calories: new Set([1008, 2047, 2048]),
  protein: new Set([1003]),
  carbs: new Set([1005, 1050]),
  fat: new Set([1004])
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  res.end(JSON.stringify(body));
}

function cleanQuery(value) {
  return String(value || "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function macroFromNutrients(nutrients, kind) {
  const ids = nutrientNumbers[kind];
  const item = (nutrients || []).find((nutrient) => ids.has(Number(nutrient.nutrientId || nutrient.nutrientNumber)));
  return number(item?.value);
}

function mapUsdaFood(food) {
  const nutrients = food.foodNutrients || [];
  return {
    external_id: `usda:${food.fdcId}`,
    source: "USDA",
    name: food.description || "USDA food",
    brand: food.brandName || food.dataType || "USDA FoodData Central",
    serving_quantity: 100,
    serving_unit: "g",
    calories: Math.round(macroFromNutrients(nutrients, "calories")),
    protein_g: Math.round(macroFromNutrients(nutrients, "protein") * 10) / 10,
    carbs_g: Math.round(macroFromNutrients(nutrients, "carbs") * 10) / 10,
    fat_g: Math.round(macroFromNutrients(nutrients, "fat") * 10) / 10,
    is_verified: true
  };
}

function mapOpenFoodProduct(product) {
  const nutriments = product.nutriments || {};
  const servingGrams = number(product.serving_quantity) || 100;
  return {
    external_id: `openfoodfacts:${product.code}`,
    source: "Open Food Facts",
    name: product.product_name || product.generic_name || "Packaged food",
    brand: product.brands || "Open Food Facts",
    serving_quantity: servingGrams,
    serving_unit: "g",
    calories: Math.round(number(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"])),
    protein_g: Math.round(number(nutriments.proteins_100g ?? nutriments.proteins) * 10) / 10,
    carbs_g: Math.round(number(nutriments.carbohydrates_100g ?? nutriments.carbohydrates) * 10) / 10,
    fat_g: Math.round(number(nutriments.fat_100g ?? nutriments.fat) * 10) / 10,
    is_verified: true
  };
}

function rankResults(results, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return [...results]
    .filter((food) => food.name && Number(food.calories) >= 0)
    .sort((a, b) => {
      const score = (food) => {
        const haystack = `${food.name} ${food.brand} ${food.source}`.toLowerCase();
        let total = food.source === "USDA" ? 8 : 4;
        if (haystack.startsWith(query.toLowerCase())) total += 20;
        total += terms.reduce((sum, term) => sum + (haystack.includes(term) ? 5 : 0), 0);
        if (/raw|breast|chicken|rice|egg|banana|oats?/.test(haystack)) total += 4;
        return total;
      };
      return score(b) - score(a) || a.name.localeCompare(b.name);
    })
    .slice(0, 20);
}

async function searchUsda(query) {
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize: 15,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"]
    })
  });

  if (!response.ok) return [];
  const data = await response.json();
  return (data.foods || []).map(mapUsdaFood);
}

async function searchOpenFoodFacts(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "10",
    fields: "code,product_name,generic_name,brands,serving_quantity,nutriments"
  });
  const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`, {
    headers: { "User-Agent": "Movementz/1.0 (nutrition search)" }
  });

  if (!response.ok) return [];
  const data = await response.json();
  return (data.products || []).map(mapOpenFoodProduct);
}

export default async function handler(req, res) {
  const query = cleanQuery(req.query?.q);
  if (!query || query.length < 2) {
    json(res, 200, { foods: [] });
    return;
  }

  try {
    const [usda, openFoodFacts] = await Promise.all([
      searchUsda(query).catch(() => []),
      searchOpenFoodFacts(query).catch(() => [])
    ]);

    json(res, 200, {
      foods: rankResults([...usda, ...openFoodFacts], query)
    });
  } catch (error) {
    json(res, 200, { foods: [], error: error.message });
  }
}
