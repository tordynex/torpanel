import React, { useMemo } from "react";
import styles from "./css/SimpleBookingForm.module.css";
import type { WorkshopServiceItem } from "@/services/workshopService";

// -------------------------------------------------------
// Pricing utils (exported)
// -------------------------------------------------------
export const formatCurrency = (ore: number) =>
  (ore / 100).toLocaleString("sv-SE", { style: "currency", currency: "SEK" });

export const calcBaseNetOre = (
  item: WorkshopServiceItem | undefined,
  durationMin: number
) => {
  if (!item) return 0;
  if (item.price_type === "fixed" && item.fixed_price_ore) return item.fixed_price_ore;
  if (item.price_type === "hourly" && item.hourly_rate_ore)
    return Math.round(item.hourly_rate_ore * (durationMin / 60));
  return 0;
};

export const addVat = (netOre: number, vatPercent?: number | null) =>
  Math.round(netOre * (1 + (vatPercent ?? 0) / 100));

export const removeVat = (grossOre: number, vatPercent?: number | null) =>
  Math.round(grossOre / (1 + (vatPercent ?? 0) / 100));

// -------------------------------------------------------
// Types
// -------------------------------------------------------
export type PriceConfig = {
  useCustomPrice: boolean;
  customIsGross: boolean; // true => customPriceOre treated as gross; false => net
  customPriceOre: number | ""; // stored in öre
  customPriceNote: string;
};

export const defaultPriceConfig = (): PriceConfig => ({
  useCustomPrice: false,
  customIsGross: true,
  customPriceOre: "",
  customPriceNote: "",
});

export type ComputePriceArgs = {
  item: WorkshopServiceItem | undefined;
  durationMin: number;
  config: PriceConfig;
};

export type ComputedPrice = { netOre: number; grossOre: number; vatPercent: number };

export function computePrice({ item, durationMin, config }: ComputePriceArgs): ComputedPrice {
  const vat = item?.vat_percent ?? 0;
  const baseNet = calcBaseNetOre(item, durationMin);

  if (config.useCustomPrice && config.customPriceOre !== "") {
    if (config.customIsGross) {
      const gross = Number(config.customPriceOre);
      return { netOre: removeVat(gross, vat), grossOre: gross, vatPercent: vat };
    } else {
      const net = Number(config.customPriceOre);
      return { netOre: net, grossOre: addVat(net, vat), vatPercent: vat };
    }
  }

  return { netOre: baseNet, grossOre: addVat(baseNet, vat), vatPercent: vat };
}

// -------------------------------------------------------
// UI component for price selection / editing
// -------------------------------------------------------
export type PriceSectionProps = {
  item: WorkshopServiceItem;
  durationMin: number;
  config: PriceConfig;
  onChange: (next: PriceConfig) => void;
};

export const PriceSection: React.FC<PriceSectionProps> = ({ item, durationMin, config, onChange }) => {
  const baseNet = useMemo(() => calcBaseNetOre(item, durationMin), [item, durationMin]);
  const baseGross = useMemo(() => addVat(baseNet, item.vat_percent), [baseNet, item.vat_percent]);

  const set = (patch: Partial<PriceConfig>) => onChange({ ...config, ...patch });

  const visibleKronor = config.customPriceOre === "" ? "" : Math.round(Number(config.customPriceOre) / 100);

  return (
      <div className={styles.field}>
        {/* Rubrik + toggle i samma rad */}
        <div
          className={styles.label}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <span>Standardpris för arbete</span>
          <label className={styles.customPriceToggle} style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={config.useCustomPrice}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  set({ useCustomPrice: true, customIsGross: true, customPriceOre: baseGross });
                } else {
                  set({ useCustomPrice: false, customPriceOre: "", customPriceNote: "" });
                }
              }}
            />
            <span>Eget pris</span>
          </label>
        </div>

        {/* Standardpris alltid synligt */}
        <div className={styles.priceRow}>
          <div className={styles.priceBox}>
            <div className={styles.priceValue}>{formatCurrency(baseGross)} inkl. moms</div>
            <div className={styles.priceSub}>
              {formatCurrency(baseNet)} exkl. moms
            </div>
          </div>
          <p>Momssats: {item.vat_percent}%</p>
        </div>

        {/* Kompakt editor när eget pris är aktivt */}
        {config.useCustomPrice && (
          <div style={{ display: "grid", gap: 10 }}>
            {/* Belopp + momsval i samma rad */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1fr) auto",
                alignItems: "end",
                gap: 12,
              }}
            >
              <div>
                <div className={styles.smallLabel}>Belopp</div>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    value={visibleKronor}
                    onChange={(e) => {
                      const kr = Number(e.target.value || 0);
                      set({ customPriceOre: Math.max(0, Math.round(kr * 100)) });
                    }}
                    placeholder="t.ex. 1995"
                    aria-label="Belopp i kronor"
                  />
                  <div className={styles.inputSuffix}>kr</div>
                </div>
              </div>

              <div>
                <div className={styles.smallLabel}>Moms</div>
                <div className={styles.segment} role="group" aria-label="Pris inkl/exkl moms">
                  <button
                    type="button"
                    className={`${styles.segmentBtn} ${config.customIsGross ? styles.segmentBtnActive : ""}`}
                    onClick={() => set({ customIsGross: true })}
                  >
                    Inkl. moms
                  </button>
                  <button
                    type="button"
                    className={`${styles.segmentBtn} ${!config.customIsGross ? styles.segmentBtnActive : ""}`}
                    onClick={() => set({ customIsGross: false })}
                  >
                    Exkl. moms
                  </button>
                </div>
              </div>
            </div>

            {/* Snabbknappar + hjälptext i en rad */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() =>
                    set({
                      customPriceOre: Math.max(
                        0,
                        Math.round(Number(config.customPriceOre || 0) * 0.9)
                      ),
                    })
                  }
                >
                  −10%
                </button>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() =>
                    set({
                      customPriceOre: Math.max(
                        0,
                        Math.round(Number(config.customPriceOre || 0) * 0.8)
                      ),
                    })
                  }
                >
                  −20%
                </button>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => set({ customPriceOre: config.customIsGross ? baseGross : baseNet })}
                >
                  Återställ
                </button>
              </div>

              <div className={styles.help} style={{ marginLeft: "auto" }}>
                Sparas som {config.customIsGross ? "inkl." : "exkl."} moms
              </div>
            </div>

            {/* Kommentar (valfritt) */}
            <div>
              <label className={styles.smallLabel} htmlFor="priceNote">
                Kommentar (valfritt)
              </label>
              <textarea
                id="priceNote"
                className={styles.commentBox}
                rows={2}
                placeholder="T.ex. kampanj, goodwill, kundavtal…"
                value={config.customPriceNote}
                onChange={(e) => set({ customPriceNote: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>
    );

};

export default PriceSection;