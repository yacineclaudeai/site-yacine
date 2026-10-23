import { describe, expect, it } from "vitest";
import { guessMapping, mapRows, matchProduct, money, parseCsv, parseSheetUrl, SheetError } from "../../lib/sheets/core";

const products = [{ id: "a1", name: "بيجامة قطيفة" }, { id: "a2", name: "روب سبور" }, { id: "a3", name: "Pyjama à fleurs" }];

describe("sheet url + csv", () => {
  it("reads id and gid", () => {
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/AbC_1-x/edit#gid=123")).toEqual({ id: "AbC_1-x", gid: "123" });
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/AbC/edit")).toEqual({ id: "AbC", gid: "0" });
    expect(parseSheetUrl("https://evil.com/spreadsheets/d/AbC")).toBeNull();
  });
  it("parses quotes, commas and newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nok"\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"\nok']]);
  });
  it("cleans money", () => {
    expect(money("2 900,00 DA")).toBe("2900");
    expect(money("1,500 دج")).toBe("1500");
    expect(money("")).toBe("");
  });
});

describe("matching", () => {
  it("finds the product exactly or inside the text", () => {
    expect(matchProduct("بيجامة قطيفة", products)?.id).toBe("a1");
    expect(matchProduct("item_title: Pyjama à fleurs couleur: Rouge", products)?.id).toBe("a3");
    expect(matchProduct("حاجة أخرى", products)).toBeNull();
  });
  it("guesses columns like Octomatic sheets, without using one column twice", () => {
    const m = guessMapping(["Order ID", "Date", "Full name", "Phone", "Address", "Wilaya", "Commune", "Product", "Variant",
      "Quantity", "Price", "Shipping price", "Total", "Note", "Country"], {});
    expect(m).toMatchObject({ ref: "Order ID", name: "Full name", phone: "Phone", delivery_price: "Shipping price", price: "Price",
      total: "Total", details: "Variant", product: "Product", qty: "Quantity", notes: "Note" });
    expect(Object.values(m)).not.toContain("Country");
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
  });
});

describe("mapRows", () => {
  const rows = [
    ["رقم الطلبية", "الاسم", "الهاتف", "المنتج", "الكمية", "السعر الكلي", "Country"],
    ["49462", "سارة", "0550 12 34 56", "item_title: Pyjama à fleurs couleur: Rouge", "2", "6 500 DA", "Algeria"],
    ["", "", "", "", "", "", ""],
    ["49463", "علي", "12", "بيجامة قطيفة", "1", "", ""],
    ["49464", "منى", "0661000000", "منتج ما كانش", "1", "", ""],
  ];
  const map = { ref: "رقم الطلبية", name: "الاسم", phone: "الهاتف", product: "المنتج", qty: "الكمية", total: "السعر الكلي" };
  it("imports good rows, skips blanks, reports bad ones", () => {
    const r = mapRows(1, rows, map, 2, products);
    expect(r.ok).toHaveLength(1);
    expect(r.ok[0]).toMatchObject({ row: 2, product_id: "a3", qty: 2, total: "6500", extra: "Country: Algeria",
      details: "item_title: Pyjama à fleurs couleur: Rouge", key: "ref:0550123456:49462" });
    expect(r.errors.map((e) => e.row)).toEqual([4, 5]);
  });
  it("start row skips old orders", () => {
    expect(mapRows(1, rows, map, 6, products).ok).toHaveLength(0);
  });
  it("needs name, phone and product", () => {
    expect(() => mapRows(1, rows, { name: "الاسم" }, 2, products)).toThrow(SheetError);
  });
  it("same row gives the same key without an order number", () => {
    const { ref: _, ...noRef } = map;
    const a = mapRows(1, rows, noRef, 2, products).ok[0].key, b = mapRows(1, rows, noRef, 2, products).ok[0].key;
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });
});
