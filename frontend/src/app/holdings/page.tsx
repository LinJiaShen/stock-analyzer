"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, X, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";

interface Holding {
  id: string;
  stock_code: string;
  stock_name: string;
  quantity: number;
  avg_cost: number | null;
  purchase_date: string | null;
  notes: string | null;
}

interface HoldingForm {
  stock_code: string;
  stock_name: string;
  quantity: string;
  avg_cost: string;
  purchase_date: string;
  notes: string;
}

const EMPTY_FORM: HoldingForm = {
  stock_code: "",
  stock_name: "",
  quantity: "",
  avg_cost: "",
  purchase_date: "",
  notes: "",
};

export default function HoldingsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HoldingForm>(EMPTY_FORM);

  const { data: holdings = [], isLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await api.get("/api/holdings/");
      return res.data as Holding[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Omit<HoldingForm, "purchase_date"> & { purchase_date?: string }) => {
      const res = await api.post("/api/holdings/", {
        stock_code: data.stock_code,
        stock_name: data.stock_name,
        quantity: parseInt(data.quantity),
        avg_cost: data.avg_cost ? parseFloat(data.avg_cost) : null,
        purchase_date: data.purchase_date || null,
        notes: data.notes || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/api/holdings/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      setShowModal(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/holdings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          quantity: parseInt(form.quantity),
          avg_cost: form.avg_cost ? parseFloat(form.avg_cost) : null,
          purchase_date: form.purchase_date || null,
          notes: form.notes || null,
        },
      });
    } else {
      createMutation.mutate({
        stock_code: form.stock_code,
        stock_name: form.stock_name,
        quantity: form.quantity,
        avg_cost: form.avg_cost,
        purchase_date: form.purchase_date,
        notes: form.notes,
      });
    }
  };

  const handleEdit = (holding: Holding) => {
    setEditingId(holding.id);
    setForm({
      stock_code: holding.stock_code,
      stock_name: holding.stock_name,
      quantity: holding.quantity.toString(),
      avg_cost: holding.avg_cost?.toString() || "",
      purchase_date: holding.purchase_date || "",
      notes: holding.notes || "",
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("確定要刪除此持倉嗎？")) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const totalCost = holdings.reduce((sum, h) => sum + (h.avg_cost || 0) * h.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">個人持倉管理</h1>
            <p className="text-sm text-gray-500 mt-1">管理您的股票持倉</p>
          </div>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            新增持倉
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-sm text-gray-500 mb-1">持倉數量</div>
            <div className="text-2xl font-bold text-gray-900">{holdings.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-sm text-gray-500 mb-1">總持倉張數</div>
            <div className="text-2xl font-bold text-gray-900">
              {holdings.reduce((sum, h) => sum + h.quantity, 0).toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="text-sm text-gray-500 mb-1">總成本</div>
            <div className="text-2xl font-bold text-gray-900">
              NT${" "}
              {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              載入中...
            </div>
          ) : holdings.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p>暫無持倉資料</p>
              <button
                onClick={handleOpenModal}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
              >
                新增第一筆持倉
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">代碼</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">名稱</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">張數</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">均價</th>
                    <th className="text-right py-3 px-4 text-gray-500 font-medium">成本</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">買入日期</th>
                    <th className="text-left py-3 px-4 text-gray-500 font-medium">備註</th>
                    <th className="text-center py-3 px-4 text-gray-500 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => (
                    <tr key={holding.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-bold text-gray-900">{holding.stock_code}</td>
                      <td className="py-3 px-4 text-gray-700">{holding.stock_name}</td>
                      <td className="py-3 px-4 text-right font-mono">{holding.quantity}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {holding.avg_cost ? holding.avg_cost.toLocaleString() : "-"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {holding.avg_cost
                          ? (holding.avg_cost * holding.quantity).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-gray-500">
                        {holding.purchase_date || "-"}
                      </td>
                      <td className="py-3 px-4 text-gray-500 max-w-[200px] truncate">
                        {holding.notes || "-"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(holding)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(holding.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? "編輯持倉" : "新增持倉"}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">股票代碼 *</label>
                  <input
                    type="text"
                    value={form.stock_code}
                    onChange={(e) => setForm({ ...form, stock_code: e.target.value })}
                    required
                    disabled={!!editingId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    placeholder="例: 2330"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">股票名稱 *</label>
                  <input
                    type="text"
                    value={form.stock_name}
                    onChange={(e) => setForm({ ...form, stock_name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例: 台積電"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">張數 *</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">平均成本</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.avg_cost}
                    onChange={(e) => setForm({ ...form, avg_cost: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="選填"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">買入日期</label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="選填"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingId(null);
                    setForm(EMPTY_FORM);
                  }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {editingId ? "儲存" : "新增"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
