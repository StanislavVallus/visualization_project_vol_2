let svg;
let g;
let xScale;
let yScale;
let width;
let height;
let tooltip;
let currentMetric = 'intensity';
let hoverLine;

const margin = { top: 20, right: 60, bottom: 30, left: 60 };
const anchorYears = [2000, 2005, 2010, 2015, 2020];

export function initBumpChart({ container }) {
  const node = d3.select(container);
  const box = node.node().getBoundingClientRect();
  width = box.width || 360;
  height = box.height || 360;

  svg = node.append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  hoverLine = g
    .append('line')
    .attr('class', 'bump-hover-line')
    .attr('y1', 0)
    .attr('y2', innerH)
    .attr('stroke', '#55648f')
    .attr('stroke-dasharray', '4 4')
    .style('opacity', 0);
}

export function updateBumpChart({ state, dataStore, colorScale, tooltip: tip, mapMetric }) {
  if (!svg) return;
  tooltip = tip;
  currentMetric = mapMetric || 'intensity';
  const selected = state.selectedCountries;
  const anchors = anchorYears.filter(y => dataStore.years.includes(y));
  if (!anchors.length) return;
  if (!selected.length) {
    g.selectAll('.bump-line').remove();
    g.selectAll('.bump-circles').remove();
    g.selectAll('.bump-left-label').remove();
    g.selectAll('.bump-right-label').remove();
  }

  let series = buildRankSeries(selected, anchors, dataStore, mapMetric);
  series = series.filter(s => s.points.some(p => p.rank != null));
  const maxRank = d3.max(series.flatMap(s => s.points.map(p => p.rank).filter(Boolean))) || Math.max(selected.length || 0, 3);

  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  xScale = d3.scalePoint().domain(anchors).range([0, innerW]);
  yScale = d3.scaleLinear().domain([1, Math.max(maxRank, 1)]).range([0, innerH]);

  // axes
  const xAxis = g.selectAll('.x-axis').data([null]);
  xAxis
    .enter()
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerH})`)
    .merge(xAxis)
    .call(d3.axisBottom(xScale).tickFormat(d3.format('d')));

  const yAxis = g.selectAll('.y-axis').data([null]);
  yAxis
    .enter()
    .append('g')
    .attr('class', 'y-axis')
    .merge(yAxis)
    .call(d3.axisLeft(yScale).tickValues(d3.range(1, maxRank + 1)).tickFormat(() => ''));

  g.selectAll('.y-grid')
    .data([null])
    .join('g')
    .attr('class', 'y-grid')
    .call(d3.axisLeft(yScale).tickValues(d3.range(1, maxRank + 1)).tickSize(-innerW).tickFormat(''))
    .selectAll('line')
    .attr('stroke', '#1b2340');
  g.selectAll('.y-grid .domain').remove();

  hoverLine
    .attr('y2', innerH)
    .style('opacity', 0);

  const lineGen = d3
    .line()
    .defined(d => d.rank != null)
    .x(d => xScale(d.year))
    .y(d => yScale(d.rank));

  const lines = g.selectAll('.bump-line').data(series, d => d.iso);
  lines
    .enter()
    .append('path')
    .attr('class', 'bump-line')
    .attr('fill', 'none')
    .attr('stroke-width', 2)
    .merge(lines)
    .attr('stroke', d => colorScale(d.iso))
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.25 : 1))
    .transition()
    .duration(600)
    .attr('d', d => lineGen(d.points));
  lines.exit().remove();

  const circles = g.selectAll('.bump-circles').data(series, d => d.iso);
  circles
    .enter()
    .append('g')
    .attr('class', 'bump-circles')
    .merge(circles)
    .selectAll('circle')
    .data(d => d.points.filter(p => p.rank != null).map(p => ({ ...p, iso: d.iso, name: d.name })))
    .join('circle')
    .attr('r', 3)
    .attr('fill', d => colorScale(d.iso))
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.25 : 1))
    .attr('cx', d => xScale(d.year))
    .attr('cy', d => yScale(d.rank))
    .on('mouseenter', (event, d) => showBumpTooltip(event, d))
    .on('mousemove', (event, d) => showBumpTooltip(event, d))
    .on('mouseleave', hideTooltip);
  circles.exit().remove();

  // outer labels
  const leftData = series
    .map(d => {
      const first = d.points.find(p => p.rank != null);
      return first ? { iso: d.iso, rank: first.rank, color: colorScale(d.iso) } : null;
    })
    .filter(Boolean);
  const rightData = series
    .map(d => {
      const last = d.points.slice().reverse().find(p => p.rank != null);
      return last ? { iso: d.iso, rank: last.rank, color: colorScale(d.iso) } : null;
    })
    .filter(Boolean);

  const leftLabels = g.selectAll('.bump-left-label').data(leftData, d => d.iso);
  leftLabels
    .enter()
    .append('text')
    .attr('class', 'bump-left-label')
    .attr('dy', '0.32em')
    .attr('text-anchor', 'end')
    .merge(leftLabels)
    .attr('fill', d => d.color)
    .attr('x', -8)
    .attr('y', d => yScale(d.rank))
    .text(d => d.iso)
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.25 : 1));
  leftLabels.exit().remove();

  const rightLabels = g.selectAll('.bump-right-label').data(rightData, d => d.iso);
  rightLabels
    .enter()
    .append('text')
    .attr('class', 'bump-right-label')
    .attr('dy', '0.32em')
    .attr('text-anchor', 'start')
    .merge(rightLabels)
    .attr('fill', d => d.color)
    .attr('x', innerW + 8)
    .attr('y', d => yScale(d.rank))
    .text(d => d.iso)
    .style('opacity', d => (state.hoveredCountry && state.hoveredCountry !== d.iso ? 0.25 : 1));
  rightLabels.exit().remove();

  const overlay = g.selectAll('.bump-overlay').data([null]);
  overlay
    .enter()
    .append('rect')
    .attr('class', 'bump-overlay')
    .attr('fill', 'transparent')
    .merge(overlay)
    .attr('width', innerW)
    .attr('height', innerH)
    .on('mousemove', event => {
      const [mx] = d3.pointer(event);
      const nearest = anchors.reduce((prev, curr) =>
        Math.abs(xScale(curr) - mx) < Math.abs(xScale(prev) - mx) ? curr : prev
      );
      hoverLine
        .attr('x1', xScale(nearest))
        .attr('x2', xScale(nearest))
        .style('opacity', 0.8);
      const year = nearest;
      const active = series
        .map(s => {
          const point = s.points.find(p => p.year === year && p.rank != null);
          return point ? { ...point, iso: s.iso } : null;
        })
        .filter(Boolean);
      if (active.length && tooltip) {
        const rows = active
          .sort((a, b) => d3.ascending(a.rank, b.rank))
          .map(d => `${d.rank}. ${d.iso} (${formatMetric(d.value, currentMetric)})`)
          .join('<br>');
        tooltip
          .style('opacity', 0.95)
          .html(`<strong>${year}</strong><br>${rows}`)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`);
      }
    })
    .on('mouseleave', () => {
      hoverLine.style('opacity', 0);
      hideTooltip();
    });
}

function buildRankSeries(selected, anchors, dataStore, mapMetric) {
  const rankByYear = new Map();
  anchors.forEach(year => {
    const rows = selected
      .map(iso => {
        const entry = dataStore.byIso.get(iso);
        const row = entry?.rowByYear.get(year);
        return { iso, value: metricValue(row, mapMetric) };
      })
      .filter(d => d.value != null);
    rows.sort((a, b) => d3.descending(a.value, b.value));
    rows.forEach((d, i) => rankByYear.set(`${d.iso}-${year}`, i + 1));
  });

  return selected.map(iso => {
    const entry = dataStore.byIso.get(iso);
    const points = anchors.map(year => ({
      iso,
      year,
      rank: rankByYear.get(`${iso}-${year}`) || null,
      value: metricValue(entry?.rowByYear.get(year), mapMetric),
      name: entry?.name || iso
    }));
    return { iso, name: entry?.name || iso, points };
  });
}

function showBumpTooltip(event, d) {
  if (!tooltip) return;
  const valueText = d.value != null ? formatMetric(d.value, currentMetric) : 'n/a';
  const metricLabel = {
    intensity: 'Electricity intensity',
    demandPerCapita: 'Demand per capita',
    gdpPerCapita: 'GDP per capita'
  }[currentMetric] || 'Electricity demand';
  tooltip
    .style('opacity', 0.95)
    .html(`<strong>${d.name}</strong><br>${d.year}: Rank ${d.rank ?? 'n/a'}<br>${metricLabel}: ${valueText}`)
    .style('left', `${event.pageX + 10}px`)
    .style('top', `${event.pageY - 10}px`);
}

function hideTooltip() {
  if (!tooltip) return;
  tooltip.transition().duration(150).style('opacity', 0);
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

function formatMetric(v, metric) {
  if (v == null || isNaN(v)) return 'n/a';
  const formatters = {
    intensity: val => `${d3.format('.3f')(val)} kWh/$`,
    demandPerCapita: val => `${d3.format('.0f')(val)} kWh/person`,
    gdpPerCapita: val => `${d3.format('.2f')(val)} $/person`
  };
  return (formatters[metric] || (val => `${d3.format(',.0f')(val)} TWh`))(v);
}
