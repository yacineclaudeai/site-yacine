export type Role = "manager" | "confirmer" | "branch" | "suivi" | "dispatch";
export type BranchType = "half" | "salary" | "ads";
export type LedgerType = "collected" | "purchase" | "sent" | "ads";

export type Profile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  joined_at: string;
  role: Role;
  branch_id: string | null;
  locked: boolean;
};

export type Branch = {
  id: string;
  name: string;
  type: BranchType;
  delivery_company: string | null;
  delivery_account: string | null;
  liquidity: number;
  active: boolean;
};

export type Variant = { id: string; product_id: string; color: string; size: string; stock: number; counted_at: string | null };

export type Product = {
  id: string;
  branch_id: string;
  name: string;
  price: number;
  min_qty: number;
  pending: boolean;
  active: boolean;
  updated_at: string;
  variants: Variant[];
};

export type LedgerEntry = {
  id: number;
  branch_id: string;
  type: LedgerType;
  amount: number;
  note: string | null;
  entry_day: string;
  reverses: number | null;
};

export const ROLE_LABEL: Record<Role, string> = {
  manager: "المدير",
  confirmer: "مؤكدة",
  branch: "فرع",
  suivi: "سويفي",
  dispatch: "عامل الإرسال",
};

export const BRANCH_TYPE_LABEL: Record<BranchType, string> = {
  half: "50/50",
  salary: "شهرية (يرجع الأدس غير)",
  ads: "أدس فقط (بلا أجر)",
};

// نفس الكلمات تاع النموذج
export const LEDGER_LABEL: Record<LedgerType, string> = {
  collected: "رفد من شركة التوصيل",
  purchase: "خلص المورد",
  sent: "بعث للمدير",
  ads: "أدس خلصها المدير",
};
