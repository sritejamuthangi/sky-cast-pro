# SkyCast

A weather app that feels like a place, not a spreadsheet: a living sky, a glossy 3D weather icon, glass cards that tilt under your pointer, and a forecast you can read at a glance.

SkyCast is plain HTML, CSS and JavaScript. There is no build step, no framework, and no API key to configure.

## Features

- **A living sky.** Colour, clouds, rain, snow, stars and lightning follow the weather and the time of day at the place you are looking at.
- **A 3D hero icon.** The current condition is modelled in Three.js with soft studio lighting. It responds to your pointer, changes with the weather, and holds still for reduced-motion preferences. Devices without WebGL 2 get a Meteocon fallback.
- **The forecast that matters.** Current temperature and “feels like”, a 25-hour strip with sunrise and sunset markers, a 10-day forecast with temperature ranges, and tiles for air quality, UV, wind, sunrise/sunset, humidity, precipitation, visibility and pressure.
- **Plain-language tips.** A short summary and practical suggestions (rain timing, what to wear, sun protection) generated from the forecast, not generic filler.
- **Search that handles real places.** Type-ahead search with keyboard support, recent searches, and correct local time zones — Paris, Texas and Paris, France are different places.
- **My location.** One tap uses the browser's geolocation and names the place with BigDataCloud reverse geocoding. Coordinates stay out of the URL.
- **Saved cities.** Pin up to 12 places; each chip shows its current temperature and condition.
- **Units that stick.** °C/°F, km/h/mph/m/s, and 12/24-hour clocks, remembered on your device.
- **Works offline.** A service worker caches the app shell, and the app saves the last forecast locally, so it opens with a clear “you're offline” banner instead of a blank page.
- **Respectful by default.** No accounts, no analytics, no cookies. Reduced-motion preferences are honoured, the layout is keyboard accessible, and the 3D scene only loads after the forecast is on screen.

## Run it locally

The app is a static site rooted at `src/`. Serve that folder with any static server:

```sh
npx serve src
```

Then open the URL it prints. Opening `src/index.html` directly from the filesystem will not work because ES modules, the import map and the service worker need HTTP.

A specific place can be opened directly:

```text
/?lat=48.8534&lon=2.3488&name=Paris&region=%C3%8Ele-de-France&country=France
```

Without a query string, SkyCast restores your last place or starts with Hyderabad.

git clone [https://github.com/sriteja-28/SkyCast-Pro.git](https://github.com/sriteja-28/SkyCast-Pro.git)

## Deploy on Vercel

The repository is already configured for Vercel in `vercel.json`:

- **Framework preset:** none
- **Build command:** none
- **Output directory:** `src`

Import the repository in Vercel and deploy. No environment variables are required.

## Project structure

```text
src/
├─ index.html              App shell, icon sprite, import map
├─ sitemap.xml             XML sitemap for search engine indexing
├─ robots.txt              Crawler access rules and sitemap reference
├─ manifest.webmanifest    Installable web app metadata
├─ sw.js                   Offline app shell and asset caching
├─ css/
│  └─ styles.css           Design system, glass surfaces, layout, motion
├─ js/
│  ├─ app.js               Bootstrap, state, units, geolocation, sharing
│  ├─ api.js               Open-Meteo and BigDataCloud requests
│  ├─ model.js             Forecast normalisation
│  ├─ conditions.js        Weather codes, icons, UV/AQI categories
│  ├─ insights.js          Summary and tips rules
│  ├─ render.js            Hero, hourly, daily, tiles, saved chips
│  ├─ sky.js               Sky palettes, clouds, rain/snow/stars/lightning
│  ├─ scene3d.js           Three.js hero icon (loaded on demand)
│  ├─ search.js            Type-ahead search and recents
│  ├─ depth.js             Pointer tilt and parallax
│  ├─ format.js            Time, temperature, wind and compass formatting
│  └─ storage.js           Local preferences, recents and saved cities
├─ assets/
│  ├─ fonts/               Self-hosted Inter (latin + latin-ext)
│  ├─ icons/               App icons (SVG + PNG, incl. maskable)
│  └─ weather/             Meteocons, animated and static
└─ vendor/
   └─ three/               Vendored Three.js build (MIT)
```

## Accessibility and performance notes

- Forecasts are rendered into semantic headings, lists and buttons; the search combobox follows the ARIA pattern and works with arrow keys, Enter and Escape.
- `prefers-reduced-motion` switches to static icons, removes the reveal and tilt animations, and renders the 3D hero as a single still frame instead of an animation loop.
- The 3D scene is skipped when WebGL 2 is unavailable, and the animated icons are swapped for still versions in lists and for reduced motion.
- The app paints a skeleton that matches the final layout, then fetches the forecast. Fonts are self-hosted and preloaded to avoid a render-blocking third-party request.
- Three.js is vendored and imported only when the 3D hero is actually used, keeping the initial page light.

## Data and credits

- **Weather, air quality and geocoding search:** [Open-Meteo](https://open-meteo.com/) — weather data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Open-Meteo is free for non-commercial use; see their terms for commercial deployments.
- **Place names for “My location”:** [BigDataCloud](https://www.bigdatacloud.com/) reverse geocoding.
- **Weather icons:** [Meteocons](https://github.com/basmilius/weather-icons) by Bas Milius (MIT).
- **3D library:** [Three.js](https://threejs.org/) r187 (MIT). The minified build is vendored in `src/vendor/three/`; see `src/vendor/three/LICENSE`.
- **UI icons:** adapted from [Lucide](https://lucide.dev) (ISC).
- **Typeface:** [Inter](https://rsms.me/inter/) by Rasmus Andersson (SIL Open Font License 1.1). The licence is included in `src/assets/fonts/LICENSE.txt`.

SkyCast itself was designed and developed by [Sri Teja Muthangi](https://www.linkedin.com/in/sritejamuthangi).
