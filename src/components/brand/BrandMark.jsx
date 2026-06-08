import { movementzWordmarkSrc } from "../../lib/brandAssets.js";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Movementz">
      <img className="brand-wordmark-img" src={movementzWordmarkSrc} alt="Movementz" />
    </div>
  );
}
