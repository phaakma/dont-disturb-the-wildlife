import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-select";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-input";
import "@esri/calcite-components/components/calcite-segmented-control";
import "@esri/calcite-components/components/calcite-segmented-control-item";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-notice";

import {
  operatorsForFieldType,
  operatorLabel,
  type FilterClause,
  type FilterFieldType,
  type FilterOperator,
  type FilterSpec,
} from "../app/filterExpression.ts";

export interface FilterFieldInfo {
  name: string;
  alias: string;
  fieldType: FilterFieldType;
}

export interface FilterDialogOptions {
  onApply: (spec: FilterSpec) => void;
}

const INPUT_TYPE: Record<FilterFieldType, "text" | "number" | "date"> = {
  string: "text",
  number: "number",
  date: "date",
};

function emptyClause(fields: FilterFieldInfo[]): FilterClause {
  const field = fields[0];
  const fieldType = field?.fieldType ?? "string";
  return { field: field?.name ?? "", fieldType, operator: operatorsForFieldType(fieldType)[0], value: "" };
}

export class FilterDialog {
  #dialog: HTMLElement;
  #body: HTMLElement;
  #options: FilterDialogOptions;

  #fields: FilterFieldInfo[] = [];
  #combinator: "AND" | "OR" = "AND";
  #rows: FilterClause[] = [];

  constructor(options: FilterDialogOptions) {
    this.#options = options;

    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", "Filter features");
    this.#dialog.setAttribute("modal", "");
    this.#dialog.setAttribute("width-scale", "l");
    this.#body = document.createElement("div");
    this.#dialog.appendChild(this.#body);
    document.body.appendChild(this.#dialog);
  }

  open(fields: FilterFieldInfo[], spec: FilterSpec): void {
    this.#fields = fields;
    this.#combinator = spec.combinator;
    this.#rows = spec.clauses.length > 0 ? spec.clauses.map((c) => ({ ...c })) : [emptyClause(fields)];
    this.#render();
    (this.#dialog as HTMLElement & { open: boolean }).open = true;
  }

  close(): void {
    (this.#dialog as HTMLElement & { open: boolean }).open = false;
  }

  destroy(): void {
    this.#dialog.remove();
  }

  /** Reads the live DOM inputs back into #rows/#combinator, so a structural change (add/remove/field-switch) doesn't lose values typed into other rows. */
  #syncFromDom(): void {
    const combinatorEl = this.#body.querySelector<HTMLElement & { value: string }>("#combinator-control");
    if (combinatorEl) this.#combinator = combinatorEl.value === "OR" ? "OR" : "AND";

    this.#body.querySelectorAll<HTMLElement>(".filter-row").forEach((row, i) => {
      const fieldEl = row.querySelector<HTMLElement & { value: string }>(".row-field");
      const opEl = row.querySelector<HTMLElement & { value: string }>(".row-operator");
      const valueEl = row.querySelector<HTMLElement & { value: string }>(".row-value");
      const current = this.#rows[i];
      if (!current) return;
      current.field = fieldEl?.value ?? current.field;
      current.operator = (opEl?.value as FilterOperator) ?? current.operator;
      current.value = valueEl?.value ?? current.value;
    });
  }

  #fieldType(fieldName: string): FilterFieldType {
    return this.#fields.find((f) => f.name === fieldName)?.fieldType ?? "string";
  }

  #addRow(): void {
    this.#syncFromDom();
    this.#rows.push(emptyClause(this.#fields));
    this.#render();
  }

  #removeRow(index: number): void {
    this.#syncFromDom();
    this.#rows.splice(index, 1);
    if (this.#rows.length === 0) this.#rows.push(emptyClause(this.#fields));
    this.#render();
  }

  #onFieldChange(index: number, fieldName: string): void {
    this.#syncFromDom();
    const fieldType = this.#fieldType(fieldName);
    this.#rows[index] = { field: fieldName, fieldType, operator: operatorsForFieldType(fieldType)[0], value: "" };
    this.#render();
  }

  #apply(): void {
    this.#syncFromDom();
    const clauses = this.#rows.filter((c) => c.field && (c.operator === "isBlank" || c.operator === "isNotBlank" || c.value.trim()));
    this.#options.onApply({ combinator: this.#combinator, clauses });
    this.close();
  }

  #clear(): void {
    this.#options.onApply({ combinator: "AND", clauses: [] });
    this.close();
  }

  #render(): void {
    const rowsHtml = this.#rows
      .map((clause, i) => {
        const fieldOptions = this.#fields
          .map((f) => `<calcite-option value="${escapeHtml(f.name)}" ${f.name === clause.field ? "selected" : ""}>${escapeHtml(f.alias)}</calcite-option>`)
          .join("");
        const operatorOptions = operatorsForFieldType(clause.fieldType)
          .map((op) => `<calcite-option value="${op}" ${op === clause.operator ? "selected" : ""}>${escapeHtml(operatorLabel(clause.fieldType, op))}</calcite-option>`)
          .join("");
        const needsValue = clause.operator !== "isBlank" && clause.operator !== "isNotBlank";

        return `
          <div class="filter-row" data-row-index="${i}" style="display:flex; gap:0.5rem; align-items:center;">
            <calcite-select class="row-field" label="Field" style="flex:1.2;">${fieldOptions}</calcite-select>
            <calcite-select class="row-operator" label="Operator" style="flex:1;">${operatorOptions}</calcite-select>
            ${
              needsValue
                ? `<calcite-input class="row-value" label="Value" type="${INPUT_TYPE[clause.fieldType]}" value="${escapeHtml(clause.value)}" style="flex:1;"></calcite-input>`
                : `<div style="flex:1;"></div>`
            }
            <calcite-action class="row-remove" icon="trash" text="Remove condition" title="Remove condition" scale="s"></calcite-action>
          </div>`;
      })
      .join("");

    this.#body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${
          this.#rows.length > 1
            ? `<calcite-segmented-control id="combinator-control" scale="s">
                <calcite-segmented-control-item value="AND" ${this.#combinator === "AND" ? "checked" : ""}>Match ALL</calcite-segmented-control-item>
                <calcite-segmented-control-item value="OR" ${this.#combinator === "OR" ? "checked" : ""}>Match ANY</calcite-segmented-control-item>
              </calcite-segmented-control>`
            : ""
        }
        ${
          this.#fields.length === 0
            ? `<calcite-notice open kind="warning"><div slot="message">This layer has no filterable fields.</div></calcite-notice>`
            : `<div style="display:flex; flex-direction:column; gap:0.5rem;">${rowsHtml}</div>
               <calcite-button id="add-row-btn" appearance="outline" icon-start="plus" width="auto">Add condition</calcite-button>`
        }
        <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.5rem;">
          <calcite-button id="clear-btn" appearance="outline" kind="danger">Clear filter</calcite-button>
          <calcite-button id="apply-btn" ${this.#fields.length === 0 ? "disabled" : ""}>Apply</calcite-button>
        </div>
      </div>
    `;

    this.#body.querySelector("#add-row-btn")?.addEventListener("click", () => this.#addRow());
    this.#body.querySelector("#apply-btn")?.addEventListener("click", () => this.#apply());
    this.#body.querySelector("#clear-btn")?.addEventListener("click", () => this.#clear());

    this.#body.querySelectorAll<HTMLElement>(".filter-row").forEach((row) => {
      const index = Number(row.getAttribute("data-row-index"));
      row.querySelector(".row-field")?.addEventListener("calciteSelectChange", (e) => {
        this.#onFieldChange(index, (e.target as HTMLElement & { value: string }).value);
      });
      row.querySelector(".row-remove")?.addEventListener("click", () => this.#removeRow(index));
    });
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
