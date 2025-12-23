# GDP & Electricity Dashboard

Interactive single-page dashboard (Vanilla JS + D3) exploring electricity demand vs economic growth using `data/owid-energy-data.csv`.

## Data
- Source: Our World in Data electricity dataset (`data/owid-energy-data.csv`).
- Years: 2000–2020 filtered for countries with ISO3 codes.
- Metrics derived:
  - Electricity intensity (kWh per $ GDP) = demand (TWh) * 1e9 / GDP ($).
  - Demand per capita (kWh/person) = demand (TWh) * 1e9 / population.
  - GDP per capita ($/person).
  - Radar extras: low-carbon share, carbon intensity (CO2/kWh), import dependence, plus intensity & demand per capita.
- Missing values: ignored per metric; percentiles used for map/radar scaling to reduce outlier skew.

## Views
- **Choropleth map** (intensity / demand per capita / GDP per capita): click to select countries, hover for tooltips; year slider with play/pause.
- **Line chart**: selected metric over time, absolute or indexed; hover shows a guide and tooltip.
- **Radar chart**: five normalized axes (clean share, usage, CO2/kWh, imports, intensity); hover a country or axis to compare, dimming others.
- **Bump chart**: rank trajectories for the selected metric across anchor years with hover guide and side labels.

## Interactions
- Click map to select; use selection chips (×) or **Clear** to manage countries.
- Map metric buttons sync all charts; line mode toggles absolute/indexed.
- Hover on map/line/radar/bump for tooltips and cross-chart highlighting.

## Run
```bash
npx http-server .
```
Open http://localhost:8080/ in a modern browser. Entry point is the root `index.html` (assets in `src/`).
