// Cálculos eléctricos simples para sugerir componentes. Ley de Ohm y valores comerciales.

/** Serie E12: los valores de resistencia que se consiguen en cualquier tienda de electrónica. */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** Valores que ofrece el editor para elegir rápido. */
export const COMMON_OHMS = [100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];

export const PIN_MAX_MA = 20; // corriente recomendada por pin del Arduino Uno
export const LED_VF = 2.0; // caída típica de un LED rojo
export const LED_MA = 15; // corriente de diseño para un LED indicador

export function formatOhms(ohms) {
  const value = Number(ohms);
  if (!Number.isFinite(value) || value <= 0) return '?';
  const short = (n) => String(Number(n.toFixed(2)));
  if (value >= 1e6) return `${short(value / 1e6)} MΩ`;
  if (value >= 1e3) return `${short(value / 1e3)} kΩ`;
  return `${short(value)} Ω`;
}

/** Valor comercial E12 igual o inmediatamente mayor. Mayor resistencia = menos corriente = más seguro. */
export function nextStandard(ohms) {
  if (!(ohms > 0)) return E12[0];
  const decade = 10 ** Math.floor(Math.log10(ohms));
  for (const base of [...E12, 10]) {
    const value = Math.round(base * decade * 100) / 100;
    if (value >= ohms - 1e-9) return value;
  }
  return 10 * decade;
}

/** Potencia comercial suficiente, con margen del doble. */
export function powerRating(watts) {
  const needed = watts * 2;
  if (needed <= 0.25) return '1/4 W';
  if (needed <= 0.5) return '1/2 W';
  if (needed <= 1) return '1 W';
  return '2 W o más';
}

/**
 * Resistencia en serie para un LED: R = (V − Vf) / I.
 * Devuelve el valor exacto, el comercial, la corriente real con ese valor y la potencia.
 */
export function ledResistor(volts, { vf = LED_VF, ma = LED_MA } = {}) {
  const exact = (volts - vf) / (ma / 1000);
  const value = nextStandard(exact);
  const current = ((volts - vf) / value) * 1000;
  const watts = ((volts - vf) ** 2) / value;
  return { exact, value, current, watts, rating: powerRating(watts) };
}

/** Corriente en mA que pasa por un LED con una resistencia dada. */
export function ledCurrent(volts, ohms, vf = LED_VF) {
  return Math.max(0, ((volts - vf) / ohms) * 1000);
}
