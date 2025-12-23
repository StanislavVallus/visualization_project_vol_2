let svg;
let g;
let xScale;
let yScale;
let xAxis;
let yAxis;
let overlay;
let width;
let height;
let content;
let tooltip;
let currentMode = 'absolute';
let focusLine;

const margin = { top: 24, right: 90, bottom: 30, left: 68 };

export function initLineChart({ container, tooltip: tip }) {
  tooltip = tip;
  const node = d3.select(container);
  const box = node.node().getBoundingClientRect();
  width = box.width || 480;
  height = box.height || 360;

  svg = node.append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  xScale = d3.scaleLinear().range([0, innerW]);
  yScale = d3.scaleLinear().range([innerH, 0]);

  xAxis = g.append('g').attr('transform', `translate(0,${innerH})`).attr('class', 'x-axis');
  yAxis = g.append('g').attr('class', 'y-axis');

  content = g.append('g').attr('class', 'lines');

  g
    .append('text')
    .attr('class', 'y-title')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2)
    .attr('y', -margin.left + 14)
    .attr('text-anchor', 'middle')
    .attr('fill', '#c7d3ff')
    .attr('font-size', 12);

  overlay = g
    .append('rect')
    .attr('class', 'overlay')
    .attr('width', innerW)
    .attr('height', innerH)
    .attr('fill', 'transparent');

  focusLine = g
    .append('line')
    .attr('class', 'focus-line')
    .attr('stroke', '#55648f')
    .attr('stroke-dasharray', '4 4')
    .attr('y1', 0)
    .attr('y2', innerH)
    .style('opacity', 0);
}

export function updateLineChart({ state, dataStore, colorScale, tooltip, onHoverCountry, mapMetric }) {
  if (!svg) return;
  currentMode = state.lineChartMode;
  const selected = state.selectedCountries;
  const years = dataStore.years;
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const series = buildSeries(selected, dataStore, state.lineChartMode, mapMetric);
  const allValues = series.flatMap(s => s.values.map(v => v.value).filter(v => v != null));

  xScale.domain(d3.extent(years));
  const yPadding = state.lineChartMode === 'absolute' ? 1.08 : 1.05;
  if (allValues.length) {
    yScale.domain([0, d3.max(allValues) * yPadding]);
  } else {
    const extent = dataStore.extents[mapMetric] || [0, 1];
    yScale.domain([0, (extent[1] || 1) * yPadding]);
  }

  const line = d3
    .line()
    .defined(d => d.value != null)
    .x(d => xScale(d.year))
    .y(d => yScale(d.value));

  const lines = content.selectAll('path.line').data(series, d => `${d.iso}-${d.metric}`);

  lines
    .enter()
    .append('path')
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke-width', 2)
    .attr('stroke', d => colorScale(d.iso))
    .style('stroke-dasharray', d => (d.metric === 'gdp' ? '6 3' : null))
    .on('mouseenter', (_, d) => onHoverCountry?.(d.iso))
    .on('mouseleave', () => onHoverCountry?.(null))
    .merge(lines)
    .transition()
    .duration(750)
    .attr('stroke', d => colorScale(d.iso))
    .attr('d', d => line(d.values))
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.2 : 1));

  lines.exit().remove();

  const formatY = state.lineChartMode === 'absolute' ? metricTickFormatter(mapMetric) : d3.format('.0f');
  xAxis.transition().duration(500).call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format('d')));
  yAxis
    .transition()
    .duration(500)
    .call(d3.axisLeft(yScale).ticks(6).tickFormat(formatY))
    .call(g => g.selectAll('.tick line').attr('stroke', '#1e2746'));

  yAxis.selectAll('.domain').attr('stroke', '#1e2746');
  xAxis.selectAll('.domain').attr('stroke', '#1e2746');

  g
    .select('.y-title')
    .text(
      state.lineChartMode === 'absolute'
        ? metricLabel(mapMetric)
        : 'Index (base = 100)'
    );

  // grid lines
  const yGrid = g.selectAll('.y-grid').data([null]);
  yGrid
    .enter()
    .append('g')
    .attr('class', 'y-grid')
    .merge(yGrid)
    .call(
      d3
        .axisLeft(yScale)
        .tickSize(-innerW)
        .tickFormat('')
        .ticks(5)
    )
    .selectAll('line')
    .attr('stroke', '#1b2340');
  yGrid.select('.domain').remove();

  overlay.on('mousemove', event => {
    const [mx] = d3.pointer(event);
    const year = Math.round(xScale.invert(mx));
    focusLine
      .attr('x1', xScale(year))
      .attr('x2', xScale(year))
      .style('opacity', 0.8);
    showTooltipForYear(year, series, formatY, event);
  });
  overlay.on('mouseleave', () => {
    tooltip.transition().duration(150).style('opacity', 0);
    focusLine.style('opacity', 0);
  });

}

function buildSeries(selected, dataStore, mode, mapMetric) {
  const series = [];
  selected.forEach(iso => {
    const entry = dataStore.byIso.get(iso);
    if (!entry) return;
    const baseRow = entry.rows.find(r => metricValue(r, mapMetric) != null);
    const baseVal = mode === 'indexed' && baseRow ? metricValue(baseRow, mapMetric) : null;
    const values = entry.rows.map(r => {
      const raw = metricValue(r, mapMetric);
      if (raw == null) return { year: r.year, value: null };
      return {
        year: r.year,
        value: mode === 'indexed' ? (baseVal ? (raw / baseVal) * 100 : null) : raw
      };
    });
    const latest = [...values].reverse().find(v => v.value != null) || { year: entry.rows[0].year, value: 0 };
    series.push({ iso, metric: mapMetric, values, latest });
  });
  return series;
}

function showTooltipForYear(year, series, format, event) {
  const active = series
    .map(s => {
      const point = s.values.find(v => v.year === year && v.value != null);
      return point ? { ...point, iso: s.iso, metric: s.metric } : null;
    })
    .filter(Boolean);
  if (!active.length) {
    tooltip.transition().duration(150).style('opacity', 0);
    return;
  }
  const rows = active
    .sort((a, b) => d3.descending(a.value, b.value))
    .map(d => `${d.iso} ${d.metric === 'gdp' ? 'GDP' : 'Demand'}: ${formatWithUnit(d)}`)
    .join('<br>');
  tooltip
    .style('opacity', 0.92)
    .html(`<strong>${year}</strong><br>${rows}`)
    .style('left', `${event.pageX + 12}px`)
    .style('top', `${event.pageY - 12}px`);
}

function formatWithUnit(d) {
  if (currentMode === 'indexed') return d3.format('.0f')(d.value);
  switch (d.metric) {
    case 'intensity':
      return `${d3.format('.3f')(d.value)} kWh/$`;
    case 'demandPerCapita':
      return `${d3.format('.0f')(d.value)} kWh/person`;
    case 'gdpPerCapita':
      return `${d3.format('.2f')(d.value)} $/person`;
    default:
      return d3.format('~s')(d.value);
  }
}

function metricValue(row, metric) {
  if (!row) return null;
  switch (metric) {
    case 'intensity':
      return row.metrics?.intensity ?? null;
    case 'demandPerCapita':
      return row.metrics?.demandPerCapita ?? null;
    case 'gdpPerCapita':
      return row.metrics?.gdpPerCapita ?? null;
    default:
      return row.electricity_demand ?? null;
  }
}

function metricLabel(metric) {
  const lookup = {
    intensity: 'Electricity intensity (kWh per $ GDP)',
    demandPerCapita: 'Demand per capita (kWh per person)',
    gdpPerCapita: 'GDP per capita ($ per person)'
  };
  return lookup[metric] || 'Metric';
}

function metricTickFormatter(metric) {
  switch (metric) {
    case 'intensity':
      return d3.format('.3f');
    case 'demandPerCapita':
      return d3.format('.0f');
    case 'gdpPerCapita':
      return d3.format('.2s');
    default:
      return d3.format('~s');
  }
}
