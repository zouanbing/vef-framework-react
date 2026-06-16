import type { ReactElement } from "react";

import type { FieldOptionSource, KeyedFormField } from "../../types";

import { css } from "@emotion/react";
import { Checkbox, DatePicker, globalCssVars, Input, InputNumber, Radio, Select, Switch } from "@vef-framework-react/components";
import { DEFAULT_DATE_FORMAT, DEFAULT_DATETIME_FORMAT } from "@vef-framework-react/shared";

const fullWidthStyle = { width: "100%" } as const;

const unsupportedCss = css({
  fontSize: globalCssVars.fontSizeSm,
  color: globalCssVars.colorTextTertiary
});

/**
 * Inline static option list — the only source resolvable without the async data
 * resolver, mirroring `render/subform-columns.tsx`. A remote / `ref` source shows
 * no options in the design sample, exactly as the runtime table cell would until
 * its data loads.
 */
function staticOptions(source: FieldOptionSource | undefined): Array<{ label: string; value: string }> {
  return source?.kind === "static"
    ? source.options.map(option => { return { label: option.label, value: String(option.value) }; })
    : [];
}

/**
 * A disabled, value-less control standing in for one table column's cell editor,
 * so the design canvas reads like the runtime `EditableTable` (header = the
 * field, body = the editor each row would show). Mirrors the per-type editor
 * mapping in `render/subform-columns.tsx`, but static — a canvas preview must
 * never bind real form state. A keyed leaf type with no table editor (e.g.
 * code-editor) falls back to a muted dash.
 */
export function SampleCell({ field }: { field: KeyedFormField }): ReactElement {
  switch (field.type) {
    case "textfield": {
      return <Input disabled placeholder={field.placeholder} style={fullWidthStyle} />;
    }

    case "textarea": {
      return <Input.TextArea autoSize disabled placeholder={field.placeholder} />;
    }

    case "number": {
      return <InputNumber disabled placeholder={field.placeholder} style={fullWidthStyle} />;
    }

    case "select": {
      return <Select disabled options={staticOptions(field.dataSource)} placeholder={field.placeholder} style={fullWidthStyle} />;
    }

    case "radio": {
      return <Radio.Group disabled options={staticOptions(field.dataSource)} />;
    }

    case "checkbox-group": {
      return <Checkbox.Group disabled options={staticOptions(field.dataSource)} />;
    }

    case "switch": {
      return <Switch disabled />;
    }

    case "date": {
      return <DatePicker disabled format={DEFAULT_DATE_FORMAT} placeholder={field.placeholder} style={fullWidthStyle} />;
    }

    case "datetime": {
      return <DatePicker disabled showTime format={DEFAULT_DATETIME_FORMAT} placeholder={field.placeholder} style={fullWidthStyle} />;
    }

    case "daterange": {
      return <DatePicker.RangePicker disabled format={DEFAULT_DATE_FORMAT} style={fullWidthStyle} />;
    }

    default: {
      return <span css={unsupportedCss}>—</span>;
    }
  }
}
