import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client.js";

const mealTypes = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
  ["snack", "Snack"]
];

const units = ["g", "kg", "ml", "l", "serving"];
const foodSelect = "id,name,brand,serving_quantity,serving_unit,calories,protein_g,carbs_g,fat_g,is_verified";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(dateValue) {
  const date = new Date(`${dateValue || todayIso()}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

function formatFoodDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function roundMacro(value) {
  const number = Number(value) || 0;
  return Math.round(number * 10) / 10;
}

function convertQuantityToServingUnit(quantity, unit, servingUnit) {
  const amount = Number(quantity) || 0;
  if (!amount) return 0;
  if (servingUnit === "g") {
    if (unit === "kg") return amount * 1000;
    if (unit === "g") return amount;
    return amount;
  }
  if (servingUnit === "ml") {
    if (unit === "l") return amount * 1000;
    if (unit === "ml") return amount;
    return amount;
  }
  return amount;
}

function calculateFromFood(food, quantity, unit) {
  if (!food) return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const servingQuantity = Number(food.serving_quantity) || 1;
  const converted = convertQuantityToServingUnit(quantity, unit, food.serving_unit);
  const multiplier = food.serving_unit === "serving" ? Number(quantity) || 0 : converted / servingQuantity;

  return {
    calories: Math.round((Number(food.calories) || 0) * multiplier),
    protein_g: roundMacro((Number(food.protein_g) || 0) * multiplier),
    carbs_g: roundMacro((Number(food.carbs_g) || 0) * multiplier),
    fat_g: roundMacro((Number(food.fat_g) || 0) * multiplier)
  };
}

function normalizeCustomServing(quantity, unit) {
  const amount = Number(quantity) || 1;
  if (unit === "kg") return { serving_quantity: amount * 1000, serving_unit: "g" };
  if (unit === "l") return { serving_quantity: amount * 1000, serving_unit: "ml" };
  return { serving_quantity: amount, serving_unit: unit };
}

function blankForm() {
  return {
    meal_type: "breakfast",
    food_name: "",
    quantity: "",
    unit: "g",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    save_custom: true
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function FoodLogScreen({ role, user }) {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [monthStart, setMonthStart] = useState(monthStartIso(todayIso()));
  const [entries, setEntries] = useState([]);
  const [monthDays, setMonthDays] = useState([]);
  const [targetCalories, setTargetCalories] = useState("");
  const [monthlyTarget, setMonthlyTarget] = useState("");
  const [trackerTarget, setTrackerTarget] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [foodResults, setFoodResults] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedNutrition = useMemo(
    () => calculateFromFood(selectedFood, form.quantity, form.unit),
    [form.quantity, form.unit, selectedFood]
  );

  const totals = useMemo(() => {
    return entries.reduce(
      (total, entry) => ({
        calories: total.calories + Number(entry.calories || 0),
        protein_g: total.protein_g + Number(entry.protein_g || 0),
        carbs_g: total.carbs_g + Number(entry.carbs_g || 0),
        fat_g: total.fat_g + Number(entry.fat_g || 0)
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );
  }, [entries]);

  const remaining = (Number(targetCalories) || 0) - totals.calories;
  const isClient = role === "client";

  const loadFoodDay = useCallback(async () => {
    if (!supabase || user.id === "demo-user") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const currentMonthStart = monthStartIso(selectedDate);
    setMonthStart(currentMonthStart);

    const [entryResult, dayTargetResult, monthTargetResult, trackerResult, monthResult] = await Promise.all([
      supabase
        .from("food_log_entries")
        .select("id,log_date,meal_type,food_name,quantity,unit,calories,protein_g,carbs_g,fat_g,created_at")
        .eq("user_id", user.id)
        .eq("log_date", selectedDate)
        .order("created_at", { ascending: true })
        .limit(80),
      supabase
        .from("food_day_targets")
        .select("target_calories")
        .eq("user_id", user.id)
        .eq("target_date", selectedDate)
        .maybeSingle(),
      supabase
        .from("food_month_targets")
        .select("target_calories")
        .eq("user_id", user.id)
        .eq("month_start", currentMonthStart)
        .maybeSingle(),
      supabase
        .from("goal_trackers")
        .select("target_calories")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("get_food_month_summary", { month_start_input: currentMonthStart })
    ]);

    setLoading(false);

    if (entryResult.error || monthResult.error) {
      const error = entryResult.error || monthResult.error;
      setMessage(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
      return;
    }

    const nextTrackerTarget = Number(trackerResult.data?.target_calories) || 0;
    const nextMonthlyTarget = Number(monthTargetResult.data?.target_calories) || 0;
    const nextTarget = Number(dayTargetResult.data?.target_calories) || nextMonthlyTarget || nextTrackerTarget || 0;

    setEntries(entryResult.data || []);
    setTrackerTarget(nextTrackerTarget);
    setMonthlyTarget(nextMonthlyTarget || nextTrackerTarget || "");
    setTargetCalories(nextTarget || "");
    setMonthDays(Array.isArray(monthResult.data?.days) ? monthResult.data.days : []);
  }, [selectedDate, user.id]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      if (alive) await loadFoodDay();
    });
    return () => {
      alive = false;
    };
  }, [loadFoodDay]);

  useEffect(() => {
    if (!supabase || !searchText.trim() || searchText.trim().length < 2) {
      setFoodResults([]);
      return undefined;
    }

    let alive = true;
    const timeout = setTimeout(async () => {
      const term = searchText.trim().replaceAll("%", "");
      const { data, error } = await supabase
        .from("food_items")
        .select(foodSelect)
        .or(`name.ilike.%${term}%,brand.ilike.%${term}%`)
        .order("is_verified", { ascending: false })
        .order("name", { ascending: true })
        .limit(20);

      if (!alive) return;
      if (error) {
        setMessage(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
        setFoodResults([]);
      } else {
        setFoodResults(data || []);
      }
    }, 350);

    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, [searchText]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseFood(food) {
    setSelectedFood(food);
    setSearchText(food.name);
    setFoodResults([]);
    setForm((current) => ({
      ...current,
      food_name: food.name,
      quantity: food.serving_unit === "serving" ? "1" : String(food.serving_quantity || 100),
      unit: food.serving_unit === "serving" ? "serving" : food.serving_unit
    }));
  }

  async function saveDailyTarget() {
    if (!supabase || user.id === "demo-user") return;
    const target = Math.max(0, Math.round(Number(targetCalories) || 0));
    const { error } = await supabase.from("food_day_targets").upsert(
      {
        user_id: user.id,
        target_date: selectedDate,
        target_calories: target
      },
      { onConflict: "user_id,target_date" }
    );

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
      return;
    }

    setMessage("Daily target saved.");
    await loadFoodDay();
  }

  async function saveMonthlyTarget() {
    if (!supabase || user.id === "demo-user") return;
    const target = Math.max(0, Math.round(Number(monthlyTarget) || 0));
    const { error } = await supabase.from("food_month_targets").upsert(
      {
        user_id: user.id,
        month_start: monthStart,
        target_calories: target
      },
      { onConflict: "user_id,month_start" }
    );

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
      return;
    }

    setMessage("Monthly default target saved.");
    await loadFoodDay();
  }

  async function logFood() {
    if (!supabase || user.id === "demo-user") return;
    const foodName = (selectedFood?.name || form.food_name || searchText).trim();
    if (!foodName) {
      setMessage("Add a food name first.");
      return;
    }

    const quantity = Math.max(0, Number(form.quantity) || 0);
    if (!quantity) {
      setMessage("Add a quantity.");
      return;
    }

    const nutrition = selectedFood
      ? selectedNutrition
      : {
          calories: Math.round(numberOrZero(form.calories)),
          protein_g: roundMacro(form.protein_g),
          carbs_g: roundMacro(form.carbs_g),
          fat_g: roundMacro(form.fat_g)
        };

    if (!nutrition.calories) {
      setMessage("Add calories for this food.");
      return;
    }

    setSaving(true);
    setMessage("");

    let customFoodId = selectedFood?.id || null;
    if (!selectedFood && form.save_custom) {
      const customServing = normalizeCustomServing(quantity, form.unit);
      const { data: customFood, error: customError } = await supabase
        .from("food_items")
        .insert({
          owner_id: user.id,
          name: foodName,
          serving_quantity: customServing.serving_quantity,
          serving_unit: customServing.serving_unit,
          calories: nutrition.calories,
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g,
          is_verified: false
        })
        .select("id")
        .single();

      if (!customError) customFoodId = customFood?.id || null;
    }

    const { error } = await supabase.from("food_log_entries").insert({
      user_id: user.id,
      log_date: selectedDate,
      meal_type: form.meal_type,
      food_item_id: customFoodId,
      food_name: foodName,
      quantity,
      unit: form.unit,
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      carbs_g: nutrition.carbs_g,
      fat_g: nutrition.fat_g
    });

    setSaving(false);

    if (error) {
      setMessage(`${error.message}. Run supabase/phase-24-food-log.sql in Supabase.`);
      return;
    }

    setMessage("Food logged.");
    setSelectedFood(null);
    setSearchText("");
    setForm(blankForm());
    await loadFoodDay();
  }

  async function deleteEntry(entryId) {
    if (!supabase || user.id === "demo-user") return;
    const { error } = await supabase.from("food_log_entries").delete().eq("id", entryId).eq("user_id", user.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadFoodDay();
  }

  if (!isClient) {
    return (
      <section className="screen-stack food-log-screen">
        <div className="screen-heading">
          <p className="eyebrow">Food log</p>
          <h1>Client feature</h1>
          <p>Food logging is available for linked clients.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-stack food-log-screen">
      <div className="screen-heading compact-heading">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h1>Food <span>Log</span></h1>
          <p>{formatFoodDate(selectedDate)}</p>
        </div>
        <div className="habit-week-score">
          <strong>{Math.round(totals.calories)}</strong>
          <span>Calories</span>
        </div>
      </div>

      {message ? <p className={message.includes("Run supabase") || message.includes("Add ") ? "form-message error" : "form-message success"}>{message}</p> : null}
      {loading ? <p className="form-message success">Loading food log...</p> : null}

      <section className="panel food-summary-card">
        <div className="food-date-row">
          <label>
            <span>Date</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
          <label>
            <span>Today target</span>
            <input inputMode="numeric" value={targetCalories} onChange={(event) => setTargetCalories(event.target.value)} />
          </label>
          <button className="primary-action compact" onClick={saveDailyTarget} type="button">
            Save day
          </button>
        </div>
        <div className="food-total-grid">
          <div>
            <span>Consumed</span>
            <strong>{Math.round(totals.calories)}</strong>
          </div>
          <div className={remaining < 0 ? "over" : ""}>
            <span>{remaining < 0 ? "Exceeded" : "Remaining"}</span>
            <strong>{Math.abs(Math.round(remaining))}</strong>
          </div>
          <div>
            <span>Protein</span>
            <strong>{Math.round(totals.protein_g)}g</strong>
          </div>
          <div>
            <span>Carbs</span>
            <strong>{Math.round(totals.carbs_g)}g</strong>
          </div>
          <div>
            <span>Fat</span>
            <strong>{Math.round(totals.fat_g)}g</strong>
          </div>
        </div>
        <div className="food-month-target">
          <label>
            <span>Monthly daily target</span>
            <input inputMode="numeric" value={monthlyTarget} onChange={(event) => setMonthlyTarget(event.target.value)} placeholder={trackerTarget ? `Tracker target ${trackerTarget}` : "Calories"} />
          </label>
          <button className="primary-action compact" onClick={saveMonthlyTarget} type="button">
            Save month
          </button>
        </div>
      </section>

      <section className="panel food-log-card">
        <p className="eyebrow">Log food</p>
        <div className="food-meal-tabs">
          {mealTypes.map(([key, label]) => (
            <button className={form.meal_type === key ? "active" : ""} key={key} onClick={() => updateForm("meal_type", key)} type="button">
              {label}
            </button>
          ))}
        </div>

        <div className="food-search-box">
          <input
            onChange={(event) => {
              setSearchText(event.target.value);
              updateForm("food_name", event.target.value);
              setSelectedFood(null);
            }}
            placeholder="Search food or type your own"
            type="search"
            value={searchText}
          />
          {foodResults.length ? (
            <div className="food-result-list">
              {foodResults.map((food) => (
                <button key={food.id} onClick={() => chooseFood(food)} type="button">
                  <strong>{food.name}</strong>
                  <span>{food.brand || (food.is_verified ? "Common food" : "Custom")} - {food.calories} cal / {food.serving_quantity}{food.serving_unit}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="food-entry-grid">
          <label>
            <span>Quantity</span>
            <input inputMode="decimal" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} placeholder="100" />
          </label>
          <label>
            <span>Unit</span>
            <select value={form.unit} onChange={(event) => updateForm("unit", event.target.value)}>
              {units.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          {selectedFood ? (
            <div className="food-calculated">
              <span>Calculated</span>
              <strong>{selectedNutrition.calories} cal</strong>
              <em>P {selectedNutrition.protein_g}g - C {selectedNutrition.carbs_g}g - F {selectedNutrition.fat_g}g</em>
            </div>
          ) : (
            <>
              <label>
                <span>Calories</span>
                <input inputMode="numeric" value={form.calories} onChange={(event) => updateForm("calories", event.target.value)} placeholder="Calories" />
              </label>
              <label>
                <span>Protein</span>
                <input inputMode="decimal" value={form.protein_g} onChange={(event) => updateForm("protein_g", event.target.value)} placeholder="Optional" />
              </label>
              <label>
                <span>Carbs</span>
                <input inputMode="decimal" value={form.carbs_g} onChange={(event) => updateForm("carbs_g", event.target.value)} placeholder="Optional" />
              </label>
              <label>
                <span>Fat</span>
                <input inputMode="decimal" value={form.fat_g} onChange={(event) => updateForm("fat_g", event.target.value)} placeholder="Optional" />
              </label>
            </>
          )}
        </div>
        {!selectedFood ? (
          <label className="food-save-custom">
            <input checked={form.save_custom} onChange={(event) => updateForm("save_custom", event.target.checked)} type="checkbox" />
            <span>Save this custom food for next time</span>
          </label>
        ) : null}
        <button className="primary-action filled" disabled={saving} onClick={logFood} type="button">
          {saving ? "Logging..." : "Log Food"}
        </button>
      </section>

      <section className="panel food-meals-card">
        <div className="section-row">
          <div>
            <p className="eyebrow">Today</p>
            <h2>Meals</h2>
          </div>
        </div>
        {mealTypes.map(([key, label]) => {
          const mealEntries = entries.filter((entry) => entry.meal_type === key);
          return (
            <article className="food-meal-section" key={key}>
              <div>
                <strong>{label}</strong>
                <span>{Math.round(mealEntries.reduce((total, entry) => total + Number(entry.calories || 0), 0))} cal</span>
              </div>
              {mealEntries.length ? (
                mealEntries.map((entry) => (
                  <div className="food-entry-row" key={entry.id}>
                    <span>
                      <strong>{entry.food_name}</strong>
                      <em>{entry.quantity}{entry.unit} - P {Math.round(entry.protein_g || 0)}g</em>
                    </span>
                    <b>{Math.round(entry.calories)} cal</b>
                    <button onClick={() => deleteEntry(entry.id)} type="button">Remove</button>
                  </div>
                ))
              ) : (
                <p className="compact-help">No {label.toLowerCase()} logged yet.</p>
              )}
            </article>
          );
        })}
      </section>

      <section className="panel food-history-card">
        <div className="section-row">
          <div>
            <p className="eyebrow">History</p>
            <h2>Month view</h2>
          </div>
          <span className="status-pill">{new Date(`${monthStart}T00:00:00`).toLocaleDateString(undefined, { month: "short" })}</span>
        </div>
        <div className="food-history-grid">
          {monthDays.map((day) => (
            <button className={day.log_date === selectedDate ? "active" : ""} key={day.log_date} onClick={() => setSelectedDate(day.log_date)} type="button">
              <span>{new Date(`${day.log_date}T00:00:00`).getDate()}</span>
              <strong>{day.calories || 0}</strong>
              <em className={Number(day.remaining_calories) < 0 ? "over" : ""}>
                {Number(day.remaining_calories) < 0 ? `+${Math.abs(day.remaining_calories)}` : `${day.remaining_calories || 0} left`}
              </em>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
