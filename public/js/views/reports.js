// Reports screen: three summaries computed by the database (joins,
// aggregates, GROUP BY / HAVING, and the v_transit_hub_congestion view).

import { get } from "../api.js";
import { barChart, levelLegend, waitChart } from "../components/charts.js";
import { chip, errorBox, field, rangeInput, segmented, viewHeader } from "../components/controls.js";
import { clearFormError, showFormError } from "../components/dialog.js";
import { table } from "../components/table.js";
import { debounce, el } from "../dom.js";
import { fmt, levelColor, levelFor } from "../format.js";
import { state } from "../state.js";

const TABS = [
  ["congestion", "Intersection congestion"],
  ["time", "Traffic by time of day"],
  ["bottlenecks", "Transit stop bottlenecks"],
];

const TIME_METRICS = [
  ["AvgWaitSec", "Avg wait"],
  ["AvgVolume", "Avg vehicles"],
  ["TotalVolume", "Total vehicles"],
  ["WorstQueue", "Worst queue"],
];

const card = (...children) => el("div", { class: "card" }, ...children);
const thresholdSlider = (value, onChange) =>
  rangeInput("min_wait", { min: 0, max: 150, step: 5, value, unit: " s", onInput: debounce(onChange, 150) });

/** Each report returns { sqlTags, controls, run(output, errors) }. */
const REPORTS = {
  congestion() {
    const params = state.reportParams;
    return {
      sqlTags: ["JOIN", "AVG / MAX / COUNT", "GROUP BY", "HAVING AVG(...) >= ?", "CASE (level of service)"],
      controls: (rerun) => field("Only intersections averaging at least",
        thresholdSlider(params.congestion, (v) => { params.congestion = v; rerun(); })),
      async run(output) {
        const rows = await get("/api/reports/congestion", { min_wait: params.congestion });
        const empty = "No intersections meet that threshold.";
        output.replaceChildren(
          card(el("h2", {}, "Average delay and level of service by intersection"),
            waitChart(rows, { empty, label: (r) => r.Intersection, sub: (r) => `${r.Neighborhood || "—"} · ${r.Readings} readings` }),
            el("div", { style: { marginTop: "14px" } }, levelLegend())),
          card(table(rows, { empty })));
      },
    };
  },

  time() {
    const params = state.reportParams;
    let dateForm;
    return {
      sqlTags: ["LEFT JOIN", "SUM / AVG / MAX / COUNT", "GROUP BY", "date range ?"],
      controls: (rerun) => {
        dateForm = el("form", { class: "filters", novalidate: true, style: { marginBottom: 0 } },
          field("From", el("input", { type: "date", name: "start", value: params.start })),
          field("To", el("input", { type: "date", name: "end", value: params.end })),
          field("Chart", segmented(TIME_METRICS, params.metric, (m) => { params.metric = m; rerun(); }, "Metric")));
        dateForm.addEventListener("change", () => {
          params.start = dateForm.start.value;
          params.end = dateForm.end.value;
          rerun();
        });
        return dateForm;
      },
      async run(output, errors) {
        clearFormError(dateForm);
        let rows;
        try {
          rows = await get("/api/reports/time-blocks", { start: params.start, end: params.end });
        } catch (err) {
          showFormError(dateForm, errors, err);
          return;
        }
        const metric = params.metric;
        const label = TIME_METRICS.find(([key]) => key === metric)[1];
        output.replaceChildren(
          card(el("h2", {}, `${label} by time of day`),
            barChart(rows, {
              label: (r) => r.TimeBlock,
              sub: (r) => `${r.Hours} · ${r.Readings} readings`,
              value: (r) => r[metric],
              color: (r) => (metric === "AvgWaitSec" ? levelColor(levelFor(r.AvgWaitSec)) : "var(--accent)"),
              display: (r) => (r[metric] === null ? "—" : `${fmt(r[metric])}${metric === "AvgWaitSec" ? " s" : ""}`),
            })),
          card(table(rows)));
      },
    };
  },

  bottlenecks() {
    const params = state.reportParams;
    return {
      sqlTags: ["VIEW v_transit_hub_congestion", "GROUP BY", "HAVING", "AVG / MAX"],
      controls: (rerun) => field("Stops averaging at least",
        thresholdSlider(params.bottleneck, (v) => { params.bottleneck = v; rerun(); })),
      async run(output) {
        const rows = await get("/api/reports/bottlenecks", { min_wait: params.bottleneck });
        const empty = "No transit stops are that congested.";
        output.replaceChildren(
          card(el("h2", {}, "Slowest transit stops"),
            waitChart(rows, { empty, label: (r) => r.Stop, sub: (r) => `${r.Route} · ${r.TimeBlock}` })),
          card(table(rows, { empty })));
      },
    };
  },
};

export async function render(main) {
  const body = el("div", {});

  async function showReport() {
    const report = REPORTS[state.reportTab]();
    const output = el("div", {});
    const errors = errorBox();
    const rerun = async () => {
      errors.hidden = true;
      try {
        await report.run(output, errors);
      } catch (err) {
        errors.textContent = err.message;
        errors.hidden = false;
      }
    };
    body.replaceChildren(
      el("div", { class: "chips", style: { margin: "0 0 14px" } }, report.sqlTags.map((tag) => chip(tag, "sql"))),
      el("section", { class: "card", style: { marginBottom: "16px" } }, report.controls(rerun), errors),
      output);
    await rerun();
  }

  main.replaceChildren(
    viewHeader("Reports", "Summaries computed by the database with joins, aggregates, GROUP BY and a view."),
    el("div", { style: { marginBottom: "16px" } },
      segmented(TABS, state.reportTab, (tab) => { state.reportTab = tab; showReport(); }, "Report")),
    body);
  await showReport();
}
