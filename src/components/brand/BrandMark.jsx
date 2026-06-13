import { movementzWordmarkSrc } from "../../lib/brandAssets.js";

export function BrandName({ className = "" }) {
  return (
    <span className={`brand-name ${className}`.trim()} aria-label="Movementz">
      <span className="brand-name-accent">M</span>
      <span>o</span>
      <span>v</span>
      <span className="brand-name-accent">e</span>
      <span>m</span>
      <span>e</span>
      <span>n</span>
      <span className="brand-name-accent">t</span>
      <span className="brand-name-accent">z</span>
    </span>
  );
}

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Movementz">
      <img className="brand-wordmark-img" src={movementzWordmarkSrc} alt="Movementz" />
    </div>
  );
}
