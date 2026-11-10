"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteOrderButton({ orderId, customerName }: { orderId:string; customerName:string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (pending || !window.confirm(`确定删除「${customerName}」的订单？\n订单号：${orderId}\n\n模型明细和联系方式将一并删除。若为赛事报名订单，对应报名也会同时取消，可在报名阶段重新报名。删除后无法恢复。`)) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, { method:"DELETE" });
      if (response.status === 404) { router.refresh(); return; }
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "删除未完成，请稍后重试。");
      if (result?.id !== orderId) throw new Error("未收到删除确认，请刷新订单列表核对。");
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "连接暂时中断，请刷新列表确认订单状态。");
      setPending(false);
    }
  }
  return <div className="admin-order-actions"><button type="button" className="button delete-order-button" onClick={remove} disabled={pending} aria-label={`删除${customerName}的订单 ${orderId}`}>{pending ? "正在删除…" : "删除订单"}</button>{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
