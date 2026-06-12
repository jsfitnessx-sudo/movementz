import { movementzIconSrc } from "../../lib/brandAssets.js";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Movementz">
      <img className="brand-icon-img" src={movementzIconSrc} alt="" />
      <div className="brand-text-mark">
        <strong>Movementz</strong>
        <span>Move - Train - Grow</span>
      </div>
    </div>
  );
}
