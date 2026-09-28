"use client";

import { useMemo, useState } from "react";

export type MasterOption = { code: string; name: string };

export function MasterDataSelect(props: {
  name: string;
  options: MasterOption[];
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [query,setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("vi");
    if (!q) return props.options;
    return props.options.filter((x) => x.name.toLocaleLowerCase("vi").includes(q));
  },[props.options,query]);

  return <div className="space-y-1">
    {props.options.length > 12 ? <input
      aria-label={"Tìm " + (props.placeholder ?? "danh mục")}
      className={props.className}
      value={query}
      onChange={(e)=>setQuery(e.target.value)}
      placeholder={"Tìm " + (props.placeholder ?? "danh mục")}
    /> : null}
    <select name={props.name} defaultValue={props.defaultValue ?? ""} required={props.required} className={props.className}>
      <option value="">{props.placeholder ?? "Chọn..."}</option>
      {visible.map((x)=><option key={x.code} value={x.code}>{x.name}</option>)}
    </select>
  </div>;
}
