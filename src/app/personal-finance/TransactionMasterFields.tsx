"use client";

import { useMemo, useState } from "react";
import type { MasterOption } from "./MasterDataSelect";
import { MasterDataSelect } from "./MasterDataSelect";

export function TransactionMasterFields(props: {
  transactionTypes: MasterOption[];
  expenseCategories: MasterOption[];
  incomeCategories: MasterOption[];
  className: string;
}) {
  const [type,setType] = useState("EXPENSE");
  const categories = useMemo(() => type === "INCOME" ? props.incomeCategories : type === "EXPENSE" ? props.expenseCategories : [], [type,props.expenseCategories,props.incomeCategories]);
  return <>
    <select name="transaction_type" value={type} onChange={(e)=>setType(e.target.value)} className={props.className} required>
      {props.transactionTypes.map((x)=><option key={x.code} value={x.code}>{x.name}</option>)}
    </select>
    {categories.length ? <MasterDataSelect name="category_code" options={categories} required placeholder="Danh mục" className={props.className}/> :
      <input type="hidden" name="category_code" value=""/>}
  </>;
}
