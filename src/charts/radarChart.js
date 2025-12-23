let svg;
let g;
let radius;
let width;
let height;
let tooltip;
let onHoverCountry;

const margin = { top: 24, right: 24, bottom: 24, left: 24 };

export function initRadarChart({ container }) {
  const node = d3.select(container);
  const box = node.node().getBoundingClientRect();
  width = box.width || 360;
  height = box.height || 360;
  radius = Math.min(width, height) / 2 - 38;

  svg = node.append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
}

export function updateRadarChart({ state, dataStore, colorScale, tooltip: tip, onHoverCountry: hoverCb }) {
  if (!svg) return;
  tooltip = tip;
  onHoverCountry = hoverCb;
  const selected = state.selectedCountries;
  const year = state.selectedYear;
  const metrics = buildMetrics(dataStore.extents, dataStore.percentiles);

  const data = selected
    .map(iso => {
      const entry = dataStore.byIso.get(iso);
      const row = entry?.rowByYear.get(year);
      if (!entry || !row) return null;
      const values = metrics.map(m => ({
        axis: m.label,
        value: m.accessor(row),
        raw: row.metrics[m.key],
        key: m.key
      }));
      return { iso, name: entry.name, values };
    })
    .filter(d => d && d.values.some(v => v.value != null));

  if (!data.length) {
    g.selectAll('.radar-area').remove();
    g.selectAll('.radar-points').remove();
  }

  const angleSlice = (Math.PI * 2) / metrics.length;
  const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);

  // grid circles
  const levels = [0.25, 0.5, 0.75, 1];
  const grid = g.selectAll('.grid').data([null]);
  const gridEnter = grid.enter().append('g').attr('class', 'grid');
  const mergedGrid = gridEnter.merge(grid);
  const circles = mergedGrid.selectAll('circle').data(levels);
  circles
    .enter()
    .append('circle')
    .attr('fill', 'none')
    .attr('stroke', '#1b2340')
    .merge(circles)
    .attr('r', d => rScale(d));
  circles.exit().remove();

  const axes = mergedGrid.selectAll('.axis').data(metrics);
  const axesEnter = axes
    .enter()
    .append('g')
    .attr('class', 'axis');

  axesEnter
    .append('line')
    .attr('stroke', '#1b2340')
    .attr('stroke-width', 1)
    .attr('x1', 0)
    .attr('y1', 0);

  axesEnter
    .append('text')
    .attr('class', 'axis-label')
    .attr('fill', '#c7d3ff')
    .attr('font-size', 10)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em');

  axes
    .merge(axesEnter)
    .select('line')
    .attr('x2', (_, i) => rScale(1.05) * Math.cos(angleSlice * i - Math.PI / 2))
    .attr('y2', (_, i) => rScale(1.05) * Math.sin(angleSlice * i - Math.PI / 2));

  axes
    .merge(axesEnter)
    .select('text')
    .attr('x', (_, i) => rScale(1.12) * Math.cos(angleSlice * i - Math.PI / 2))
    .attr('y', (_, i) => rScale(1.12) * Math.sin(angleSlice * i - Math.PI / 2))
    .text(d => d.shortLabel || d.label)
    .on('mouseenter', (event, d) => showAxisTooltip(event, d, data))
    .on('mousemove', (event, d) => showAxisTooltip(event, d, data))
    .on('mouseleave', hideTooltip);

  axes.exit().remove();

  const radarLine = d3
    .lineRadial()
    .radius(d => rScale(d.value ?? 0))
    .angle((_, i) => i * angleSlice)
    .defined(d => d.value != null);

  const polygons = g.selectAll('.radar-area').data(data, d => d.iso);
  polygons
    .enter()
    .append('path')
    .attr('class', 'radar-area')
    .attr('fill-opacity', 0.15)
    .attr('stroke-width', 2)
    .merge(polygons)
    .attr('stroke', d => colorScale(d.iso))
    .attr('fill', d => colorScale(d.iso))
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.25 : 1))
    .on('mouseenter', (event, d) => handleHoverCountry(event, d))
    .on('mousemove', (event, d) => handleHoverCountry(event, d))
    .on('mouseleave', () => handleHoverCountry(null, null, true))
    .transition()
    .duration(600)
    .attr('d', d => radarLine(d.values));
  polygons.exit().remove();

  const points = g.selectAll('.radar-points').data(data, d => d.iso);
  const pointsEnter = points.enter().append('g').attr('class', 'radar-points');
  pointsEnter.merge(points).selectAll('circle').data(d => d.values.map(v => ({ ...v, iso: d.iso, name: d.name })))
    .join('circle')
    .attr('r', 2.5)
    .attr('fill', d => colorScale(d.iso))
    .attr('cx', (d, i) => rScale(d.value ?? 0) * Math.cos(angleSlice * i - Math.PI / 2))
    .attr('cy', (d, i) => rScale(d.value ?? 0) * Math.sin(angleSlice * i - Math.PI / 2))
    .style('pointer-events', 'none');
  points.exit().remove();
}

function buildMetrics(extents, percentiles) {
  const normalize = (v, [min, max]) => {
    if (v == null || min == null || max == null || max === min) return null;
    const clamped = Math.max(min, Math.min(max, v));
    return (clamped - min) / (max - min);
  };
  const invert = (v, rng) => {
    const n = normalize(v, rng);
    return n == null ? null : 1 - n;
  };

  const rng = (key, extents, percentiles) => percentiles?.[key] || extents?.[key] || [0, 1];

  return [
    {
      key: 'lowCarbonShare',
      label: 'Low-carb elec %',
      shortLabel: 'Low-carbon',
      accessor: row => normalize(row.metrics.lowCarbonShare, rng('lowCarbonShare', extents, percentiles))
    },
    {
      key: 'demandPerCapita',
      label: 'Elec pc (kWh/person)',
      shortLabel: 'Elec pc',
      accessor: row => normalize(row.metrics.demandPerCapita, rng('demandPerCapita', extents, percentiles))
    },
    {
      key: 'carbonIntensity',
      label: 'CO2/kWh (low better)',
      shortLabel: 'CO2/kWh',
      accessor: row => invert(row.metrics.carbonIntensity, rng('carbonIntensity', extents, percentiles))
    },
    {
      key: 'importDependence',
      label: 'Imports share',
      shortLabel: 'Imports',
      accessor: row => {
        const v = row.metrics.importDependence;
        if (v == null) return null;
        const bounded = Math.max(0, v);
        return normalize(bounded, rng('importDependence', extents, percentiles));
      }
    },
    {
      key: 'intensity',
      label: 'kWh per $ (low better)',
      shortLabel: 'kWh/$',
      accessor: row => invert(row.metrics.intensity, rng('intensity', extents, percentiles))
    }
  ];
}

function showRadarTooltip(event, d) {
  if (!tooltip) return;
  const format = radarFormatter(d.key, d.raw);
  tooltip
    .style('opacity', 0.95)
    .html(`<strong>${d.name}</strong><br>${d.axis}: ${format}`)
    .style('left', `${event.pageX + 10}px`)
    .style('top', `${event.pageY - 10}px`);
}

function showAxisTooltip(event, metric, data) {
  if (!tooltip) return;
  const rows = data
    .map(d => {
      const v = d.values.find(v => v.key === metric.key);
      return v && v.raw != null ? `${d.name}: ${radarFormatter(metric.key, v.raw)}` : null;
    })
    .filter(Boolean)
    .join('<br>');
  tooltip
    .style('opacity', 0.95)
    .html(`<strong>${metric.label}</strong><br>${rows || 'No data'}`)
    .style('left', `${event.pageX + 10}px`)
    .style('top', `${event.pageY - 10}px`);
}

function radarFormatter(key, raw) {
  if (raw == null || isNaN(raw)) return 'n/a';
  const formatters = {
    lowCarbonShare: v => `${d3.format('.1f')(v)}%`,
    demandPerCapita: v => `${d3.format('.0f')(v)} kWh/person`,
    carbonIntensity: v => `${d3.format('.0f')(v)} gCO2/kWh`,
    importDependence: v => `${d3.format('.0%')(v)}`,
    intensity: v => `${d3.format('.3f')(v)} kWh/$`
  };
  return (formatters[key] || d3.format('.2f'))(raw);
}

function hideTooltip() {
  if (!tooltip) return;
  tooltip.transition().duration(150).style('opacity', 0);
}

function handleHoverCountry(event, datum, leaving = false) {
  if (leaving) {
    hideTooltip();
    onHoverCountry?.(null);
    return;
  }
  if (!datum) return;
  onHoverCountry?.(datum.iso);
  const rows = datum.values
    .map(v => `${v.axis}: ${radarFormatter(v.key, v.raw)}`)
    .join('<br>');
  tooltip
    .style('opacity', 0.95)
    .html(`<strong>${datum.name}</strong><br>${rows}`)
    .style('left', `${event.pageX + 10}px`)
    .style('top', `${event.pageY - 10}px`);
}
