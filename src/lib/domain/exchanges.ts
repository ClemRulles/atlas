/**
 * Places boursières et heures d'ouverture, pour le globe.
 * Approximation assumée : jours ouvrés seulement, sans jours fériés ni pause de midi.
 */

export interface Exchange {
  id: string;
  name: string;
  city: string;
  timeZone: string;
  /** Heures locales d'ouverture et de fermeture, en minutes depuis minuit. */
  open: number;
  close: number;
  location: [number, number];
}

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export const EXCHANGES: Exchange[] = [
  { id: "xbru", name: "Euronext Bruxelles", city: "Bruxelles", timeZone: "Europe/Brussels", open: h(9), close: h(17, 30), location: [50.85, 4.35] },
  { id: "xams", name: "Euronext Amsterdam", city: "Amsterdam", timeZone: "Europe/Amsterdam", open: h(9), close: h(17, 30), location: [52.37, 4.9] },
  { id: "xpar", name: "Euronext Paris", city: "Paris", timeZone: "Europe/Paris", open: h(9), close: h(17, 30), location: [48.86, 2.35] },
  { id: "xetr", name: "Xetra", city: "Francfort", timeZone: "Europe/Berlin", open: h(9), close: h(17, 30), location: [50.11, 8.68] },
  { id: "xlon", name: "Bourse de Londres", city: "Londres", timeZone: "Europe/London", open: h(8), close: h(16, 30), location: [51.51, -0.13] },
  { id: "xswx", name: "SIX", city: "Zurich", timeZone: "Europe/Zurich", open: h(9), close: h(17, 30), location: [47.37, 8.54] },
  { id: "xnys", name: "NYSE et Nasdaq", city: "New York", timeZone: "America/New_York", open: h(9, 30), close: h(16), location: [40.71, -74.0] },
  { id: "xtse", name: "Bourse de Toronto", city: "Toronto", timeZone: "America/Toronto", open: h(9, 30), close: h(16), location: [43.65, -79.38] },
  { id: "bvmf", name: "B3", city: "São Paulo", timeZone: "America/Sao_Paulo", open: h(10), close: h(17), location: [-23.55, -46.63] },
  { id: "xtks", name: "Bourse de Tokyo", city: "Tokyo", timeZone: "Asia/Tokyo", open: h(9), close: h(15, 30), location: [35.68, 139.69] },
  { id: "xhkg", name: "Bourse de Hong Kong", city: "Hong Kong", timeZone: "Asia/Hong_Kong", open: h(9, 30), close: h(16), location: [22.32, 114.17] },
  { id: "xshg", name: "Bourse de Shanghai", city: "Shanghai", timeZone: "Asia/Shanghai", open: h(9, 30), close: h(15), location: [31.23, 121.47] },
  { id: "xtai", name: "Bourse de Taïwan", city: "Taipei", timeZone: "Asia/Taipei", open: h(9), close: h(13, 30), location: [25.03, 121.57] },
  { id: "xkrx", name: "Bourse de Corée", city: "Séoul", timeZone: "Asia/Seoul", open: h(9), close: h(15, 30), location: [37.57, 126.98] },
  { id: "xnse", name: "NSE", city: "Bombay", timeZone: "Asia/Kolkata", open: h(9, 15), close: h(15, 30), location: [19.08, 72.88] },
  { id: "xasx", name: "ASX", city: "Sydney", timeZone: "Australia/Sydney", open: h(10), close: h(16), location: [-33.87, 151.21] },
];

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Jour de la semaine (1 = lundi) et minutes depuis minuit, à l'heure locale du fuseau. */
export function localClock(instant: Date, timeZone: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { weekday: WEEKDAYS[get("weekday")] ?? 0, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isOpen(exchange: Exchange, instant: Date): boolean {
  const { weekday, minutes } = localClock(instant, exchange.timeZone);
  return weekday >= 1 && weekday <= 5 && minutes >= exchange.open && minutes < exchange.close;
}

/** Coordonnées approximatives des pays, pour poser l'argent investi sur le globe. */
export const COUNTRY_LOCATIONS: Record<string, [number, number]> = {
  "États-Unis": [39.5, -98.35],
  Canada: [56.1, -106.3],
  Brésil: [-14.2, -51.9],
  Mexique: [23.6, -102.5],
  "Royaume-Uni": [54.0, -2.0],
  France: [46.6, 2.2],
  Allemagne: [51.2, 10.4],
  "Pays-Bas": [52.1, 5.3],
  Belgique: [50.5, 4.5],
  Suisse: [46.8, 8.2],
  Danemark: [56.0, 9.5],
  Japon: [36.2, 138.25],
  Chine: [35.9, 104.2],
  Taïwan: [23.7, 121.0],
  "Corée du Sud": [35.9, 127.8],
  Inde: [20.6, 79.0],
  Australie: [-25.3, 133.8],
  "Arabie saoudite": [23.9, 45.1],
  "Afrique du Sud": [-30.6, 22.9],
};
