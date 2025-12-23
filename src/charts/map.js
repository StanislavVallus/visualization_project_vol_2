const worldUrl = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';

let svg;
let g;
let projection;
let path;
let geojson;
let tooltip;
let onSelectCountry;
let onHoverCountry;
let legendEl;
let colorScale;
let zoomBehavior;
let currentZoom = 1;
let selectedForZoom = new Set();

export async function initMap({ container, legendEl: legendSelector, tooltip: tip, onSelectCountry: onSelect, onHoverCountry: onHover, colorScale: colors }) {
  tooltip = tip;
  onSelectCountry = onSelect;
  onHoverCountry = onHover;
  legendEl = legendSelector;
  colorScale = colors;

  geojson = await d3.json(worldUrl);
  const node = d3.select(container);
  const { width, height } = node.node().getBoundingClientRect();
  const w = width || 900;
  const h = height || 520;

  projection = d3.geoNaturalEarth1().fitSize([w, h], geojson);
  path = d3.geoPath(projection);

  svg = node.append('svg').attr('viewBox', `0 0 ${w} ${h}`);
  g = svg.append('g');

  zoomBehavior = d3
    .zoom()
    .scaleExtent([1, 8])
    .translateExtent([
      [-w * 0.1, -h * 0.1],
      [w * 1.1, h * 1.1]
    ])
    .on('zoom', event => {
      currentZoom = event.transform.k;
      g.attr('transform', event.transform);
      g.selectAll('path').attr('stroke-width', d => (selectedForZoom.has(d.id) ? 1.8 : 0.6) / event.transform.k);
    });

  svg.call(zoomBehavior);
}

export function updateMap({ state, dataStore, mapMetric, selectedYear }) {
  if (!geojson) return;
  const metricKey = mapMetric;
  const extent = mapExtent(metricKey, dataStore);
  if (!extent || extent.some(v => v == null || Number.isNaN(v))) return;
  const color = d3.scaleSequential(interpolator(metricKey)).domain(extent).clamp(true);
  const values = new Map();

  dataStore.byIso.forEach(entry => {
    const row = entry.rowByYear.get(selectedYear);
    if (!row) return;
    const val = getMetricValue(row, metricKey);
    values.set(entry.iso, val);
  });

  const selected = new Set(state.selectedCountries);
  const hovered = state.hoveredCountry;
  // store for zoom stroke widths
  selectedForZoom = selected;

  const countries = g.selectAll('path.country').data(geojson.features, d => d.id);

  const entered = countries
    .enter()
    .append('path')
    .attr('class', 'country')
    .attr('d', path)
    .attr('fill', '#1e2541')
    .attr('stroke', '#0b1021')
    .attr('stroke-width', 0.6 / currentZoom);

  const all = entered.merge(countries);

  all
    .on('mouseenter', (event, d) => handleHover(event, d, values, color, metricKey))
    .on('mousemove', (event, d) => handleHover(event, d, values, color, metricKey))
    .on('mouseleave', () => handleHover(null, null, values, color, metricKey, true))
    .on('click', (_, d) => onSelectCountry?.(d.id));

  all
    .transition()
    .duration(750)
    .attr('fill', d => {
      const val = values.get(d.id);
      return val == null || isNaN(val) ? '#2a2f45' : color(val);
    })
    .attr('opacity', d => (hovered && hovered !== d.id ? 0.45 : 1))
    .attr('stroke', d => (selected.has(d.id) ? '#00e6ff' : '#0b1021'))
    .attr('stroke-width', d => (selected.has(d.id) ? 1.8 : 0.6) / currentZoom);

  countries.exit().remove();

  updateLegend(extent, metricKey);
}

function getMetricValue(row, key) {
  if (!row) return null;
  switch (key) {
    case 'intensity':
      return row.metrics.intensity;
    case 'demandPerCapita':
      return row.metrics.demandPerCapita;
    case 'gdpPerCapita':
      return row.metrics.gdpPerCapita;
    default:
      return null;
  }
}

function metricLabel(key) {
  const lookup = {
    intensity: 'Electricity intensity (kWh per $ GDP)',
    demandPerCapita: 'Demand per capita (kWh per person)',
    gdpPerCapita: 'GDP per capita ($ per person)'
  };
  return lookup[key] || key;
}

function mapExtent(metricKey, dataStore) {
  const pct = dataStore.percentiles?.[metricKey];
  if (pct && pct.every(v => v != null && !Number.isNaN(v))) return pct;
  return dataStore.extents[metricKey];
}

function interpolator() {
  // perceptually uniform, higher = brighter
  return d3.interpolateCividis;
}

function handleHover(event, d, values, color, metricKey, leaving = false) {
  if (leaving) {
    tooltip.transition().duration(200).style('opacity', 0);
    onHoverCountry?.(null);
    return;
  }
  const iso = d.id;
  const name = d.properties?.name || iso;
  const val = values.get(iso);
  onHoverCountry?.(iso);
  if (val == null || isNaN(val)) {
    tooltip.transition().duration(200).style('opacity', 0);
    return;
  }
  tooltip
    .style('opacity', 0.95)
    .html(`<strong>${name}</strong><br>${metricLabel(metricKey)}: ${formatValue(val, metricKey)}`)
    .style('left', `${event.pageX + 10}px`)
    .style('top', `${event.pageY - 10}px`);
}

function formatValue(v, key) {
  if (v == null || isNaN(v)) return 'n/a';
  const abs = Math.abs(v);
  const units = {
    intensity: 'kWh per $',
    demandPerCapita: 'kWh per person',
    gdpPerCapita: '$ per person'
  };
  let base;
  if (key === 'intensity') base = d3.format('.3f')(v);
  else if (key === 'demandPerCapita') base = d3.format('.0f')(v);
  else if (key === 'gdpPerCapita') base = d3.format('.2f')(v);
  else base = abs >= 1 ? d3.format('.2s')(v) : abs >= 0.01 ? d3.format('.2f')(v) : d3.format('.2e')(v);
  return `${base}${units[key] ? ' ' + units[key] : ''}`;
}

function updateLegend(extent, key) {
  const format = d3.format('.2s');
  const legend = d3.select(legendEl);
  legend.html('');
  legend.append('div').text(metricLabel(key)).style('font-weight', '600');
  const bar = legend.append('div').attr('class', 'bar');
  const stops = d3.range(0, 1.01, 0.25).map(t => `${interpolator()(t)} ${Math.round(t * 100)}%`);
  bar.style('background', `linear-gradient(90deg, ${stops.join(',')})`);
  const scale = legend.append('div').attr('class', 'scale');
  scale.append('span').text(extent[0] == null ? '–' : format(extent[0]));
  scale.append('span').text(extent[1] == null ? '–' : format(extent[1]));
}
