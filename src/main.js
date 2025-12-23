import { initMap, updateMap } from './charts/map.js';
import { initLineChart, updateLineChart } from './charts/lineChart.js';
import { initRadarChart, updateRadarChart } from './charts/radarChart.js';
import { initBumpChart, updateBumpChart } from './charts/bumpChart.js';

const state = {
  selectedYear: 2020,
  selectedCountries: [],
  hoveredCountry: null,
  lineChartMode: 'absolute',
  mapMetric: 'intensity'
};

const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
const tooltip = d3.select('#tooltip');

// problem with paths - editing (stanislav)
// const dataPath = '../data/owid-energy-data.csv';
const dataPath = 'data/owid-energy-data.csv';
let dataStore = null;
let mapReady = null;
let playTimer = null;

init();

async function init() {
  dataStore = await loadData();
  setupControls(dataStore);
  mapReady = initMap({
    container: '#map',
    legendEl: '#map-legend',
    tooltip,
    onSelectCountry: toggleCountry,
    onHoverCountry: iso => setState({ hoveredCountry: iso }),
    colorScale
  });
  initLineChart({ container: '#line-chart', tooltip });
  initRadarChart({ container: '#radar-chart' });
  initBumpChart({ container: '#bump-chart' });
  await mapReady;
  renderAll();
}

function setupControls(store) {
  const years = store.years;
  const slider = document.getElementById('year-slider');
  slider.min = years[0];
  slider.max = years[years.length - 1];
  slider.value = Math.min(state.selectedYear, years[years.length - 1]);
  state.selectedYear = +slider.value;
  document.getElementById('year-label').textContent = state.selectedYear;
  slider.addEventListener('input', e => {
    stopPlaying();
    document.getElementById('play-button').textContent = 'Play';
    setState({ selectedYear: +e.target.value });
  });
  slider.addEventListener('mousedown', stopPlaying);

  const mapToggle = document.getElementById('map-metric-toggle');
  mapToggle.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metric === state.mapMetric);
    btn.addEventListener('click', () => {
      mapToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ mapMetric: btn.dataset.metric });
    });
  });

  const clearBtn = document.getElementById('clear-selection');
  clearBtn.addEventListener('click', () => setState({ selectedCountries: [], hoveredCountry: null }));

  const playBtn = document.getElementById('play-button');
  playBtn.addEventListener('click', () => {
    if (playTimer) {
      stopPlaying();
      playBtn.textContent = 'Play';
    } else {
      playBtn.textContent = 'Pause';
      startPlaying(slider, years);
    }
  });

  const toggle = document.getElementById('line-mode-toggle');
  toggle.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.lineChartMode);
    btn.addEventListener('click', () => {
      toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState({ lineChartMode: btn.dataset.mode });
    });
  });
}

function setState(updates) {
  let changed = false;
  Object.entries(updates).forEach(([k, v]) => {
    if (state[k] !== v) changed = true;
    state[k] = v;
  });
  if (changed) {
    document.getElementById('year-label').textContent = state.selectedYear;
    renderAll();
  }
}

async function loadData() {
  const num = val => {
    const v = +val;
    return Number.isFinite(v) ? v : null;
  };

  const keepYears = [2000, 2020];
  const rowsByIso = new Map();
  const metricArrays = {
    intensity: [],
    demandPerCapita: [],
    gdpPerCapita: [],
    carbonIntensity: [],
    lowCarbonShare: [],
    importDependence: []
  };

  const raw = await d3.csv(dataPath, d => {
    const iso = d.iso_code;
    const year = num(d.year);
    if (!iso || iso.length !== 3 || !year || year < keepYears[0] || year > keepYears[1]) return null;
    const gdp = num(d.gdp);
    const pop = num(d.population);
    const demand = num(d.electricity_demand);
    const carbonIntensity = num(d.carbon_intensity_elec);
    const lowCarbonShare = num(d.low_carbon_share_elec);
    const netImports = num(d.net_elec_imports);

    // demand is in TWh, convert to kWh for intensity (kWh per $)
    const intensity = gdp && demand ? (demand * 1e9) / gdp : null;
    const demandPerCapita = demand && pop ? (demand / pop) * 1e9 : num(d.electricity_demand_per_capita);
    const gdpPerCapita = gdp && pop ? gdp / pop : null;
    const importDependence = demand && netImports != null ? Math.min(Math.max(netImports / demand, 0), 1) : null;

    const record = {
      country: d.country,
      iso,
      year,
      gdp,
      population: pop,
      electricity_demand: demand,
      carbonIntensity,
      lowCarbonShare,
      netImports,
      metrics: {
        intensity,
        demandPerCapita,
        gdpPerCapita,
        carbonIntensity,
        lowCarbonShare,
        importDependence
      }
    };
    Object.entries(record.metrics).forEach(([k, v]) => {
      if (v != null && metricArrays[k]) metricArrays[k].push(v);
    });
    return record;
  });

  raw.filter(Boolean).forEach(row => {
    if (!rowsByIso.has(row.iso)) rowsByIso.set(row.iso, { name: row.country, iso: row.iso, rows: [], rowByYear: new Map() });
    const entry = rowsByIso.get(row.iso);
    entry.rows.push(row);
    entry.rowByYear.set(row.year, row);
  });

  rowsByIso.forEach(entry => entry.rows.sort((a, b) => a.year - b.year));

  const years = Array.from(new Set(raw.filter(Boolean).map(d => d.year))).sort((a, b) => a - b);
  const extents = Object.fromEntries(Object.entries(metricArrays).map(([k, arr]) => [k, d3.extent(arr)]));
  const percentiles = Object.fromEntries(
    Object.entries(metricArrays).map(([k, arr]) => {
      const clean = arr.filter(v => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
      return [k, clean.length ? [d3.quantileSorted(clean, 0.05), d3.quantileSorted(clean, 0.95)] : [null, null]];
    })
  );

  return {
    byIso: rowsByIso,
    years,
    extents,
    percentiles
  };
}

function toggleCountry(iso) {
  const exists = state.selectedCountries.includes(iso);
  const updated = exists ? state.selectedCountries.filter(c => c !== iso) : [...state.selectedCountries, iso];
  setState({ selectedCountries: updated });
}

function renderAll() {
  if (!dataStore) return;
  updateLegend();
  updateMetricButtons();
  if (mapReady) {
    updateMap({
      state,
      dataStore,
      colorScale,
      tooltip,
      mapMetric: state.mapMetric,
      selectedYear: state.selectedYear
    });
  }
  updateLineChart({
    state,
    dataStore,
    colorScale,
    tooltip,
    onHoverCountry: iso => setState({ hoveredCountry: iso }),
    mapMetric: state.mapMetric
  });
  updateRadarChart({
    state,
    dataStore,
    colorScale,
    tooltip,
    onHoverCountry: iso => setState({ hoveredCountry: iso })
  });
  updateBumpChart({ state, dataStore, colorScale, tooltip, mapMetric: state.mapMetric });
  updateTitles();
}

function updateLegend() {
  const legend = d3.select('#selection-legend');
  const items = legend.selectAll('.legend-item').data(state.selectedCountries, d => d);
  const enter = items.enter().append('div').attr('class', 'legend-item');
  enter.append('span').attr('class', 'legend-swatch');
  enter.append('span');
  enter.append('button').attr('class', 'legend-remove').text('×').on('click', (_, d) => toggleCountry(d));
  const merged = items.merge(enter);
  merged.select('.legend-swatch').style('background', d => colorScale(d));
  merged.select('span:nth-child(2)').text(d => dataStore.byIso.get(d)?.name || d);
  items.exit().remove();
}

function startPlaying(slider, years) {
  stopPlaying();
  const max = years[years.length - 1];
  playTimer = setInterval(() => {
    const next = state.selectedYear + 1;
    if (next > max) {
      stopPlaying();
      document.getElementById('play-button').textContent = 'Play';
      return;
    }
    slider.value = next;
    setState({ selectedYear: next });
  }, 500);
}

function stopPlaying() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function metricLabel(key) {
  const lookup = {
    intensity: 'Electricity intensity (kWh per $ GDP)',
    demandPerCapita: 'Demand per capita (kWh per person)',
    gdpPerCapita: 'GDP per capita ($ per person)'
  };
  return lookup[key] || 'Electricity demand';
}

function updateTitles() {
  const mapTitle = document.getElementById('map-title-text');
  if (mapTitle) mapTitle.textContent = `Map: ${metricLabel(state.mapMetric)}`;
  const bumpTitle = document.querySelector('#bump-card h3');
  if (bumpTitle) bumpTitle.textContent = `Rank Shifts by ${metricLabel(state.mapMetric)}`;
  const lineTitle = document.querySelector('#line-chart-card h3');
  if (lineTitle) lineTitle.textContent = `Trends: ${metricLabel(state.mapMetric)}`;
}

function updateMetricButtons() {
  const mapToggle = document.getElementById('map-metric-toggle');
  if (!mapToggle) return;
  mapToggle.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metric === state.mapMetric);
  });
}
