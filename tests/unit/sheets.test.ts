import { describe, expect, it } from "vitest";
import { csvUrls, guessMapping, mapRows, matchProduct, money, parseCsv, parseSheetUrl, SheetError, sheetProducts, table } from "../../lib/sheets/core";

const products = [{ id: "a1", name: "بيجامة قطيفة" }, { id: "a2", name: "روب سبور" }, { id: "a3", name: "Pyjama à fleurs" }];

describe("sheet url + csv", () => {
  it("reads id and gid", () => {
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbC_1-xyzABCDEF/edit#gid=123")).toEqual({ id: "1AbC_1-xyzABCDEF", gid: "123", published: false });
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbCdefghijk/edit?usp=sharing")).toEqual({ id: "1AbCdefghijk", gid: null, published: false });
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/u/0/d/1AbCdefghijk/edit?gid=5#gid=5")?.gid).toBe("5");
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vAbc/pubhtml")).toEqual({ id: "2PACX-1vAbc", gid: null, published: true });
    expect(parseSheetUrl("https://evil.com/spreadsheets/d/AbC")).toBeNull();
  });
  it("builds export urls (no gid = first tab)", () => {
    expect(csvUrls({ id: "X", gid: null, published: false })[0]).toBe("https://docs.google.com/spreadsheets/d/X/export?format=csv");
    expect(csvUrls({ id: "X", gid: "7", published: false })[1]).toContain("gviz/tq?tqx=out:csv&gid=7");
    expect(csvUrls({ id: "P", gid: null, published: true })).toEqual(["https://docs.google.com/spreadsheets/d/e/P/pub?output=csv"]);
  });
  it("parses quotes, commas and newlines", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nok"\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"\nok']]);
  });
  it("puts back the 0 that Sheets removes from phones", async () => {
    const { fixPhone } = await import("../../lib/sheets/core");
    expect(fixPhone("776351302")).toBe("0776351302");
    expect(fixPhone("+213 661 22 33 44")).toBe("0661223344");
    expect(fixPhone("0550 11 22 33")).toBe("0550112233");
    expect(fixPhone("+ 0659206622")).toBe("0659206622");
    expect(fixPhone("021 23 45 67")).toBe("021 23 45 67");
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
    expect(guessMapping(["Type de livraison", "Prix livraison"], {})).toEqual({ delivery_type: "Type de livraison", delivery_price: "Prix livraison" });
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
  it("imports good rows, skips blanks, reports bad ones, keeps unknown products unlinked", () => {
    const r = mapRows(1, rows, map, 2, products);
    expect(r.ok).toHaveLength(2);
    expect(r.ok[1]).toMatchObject({ row: 5, product_id: "", product_name: "منتج ما كانش" });
    expect(r.ok[0]).toMatchObject({ row: 2, product_id: "a3", qty: 2, total: "6500", extra: "Country: Algeria",
      details: "item_title: Pyjama à fleurs couleur: Rouge", key: "ref:0550123456:49462" });
    expect(r.errors.map((e) => e.row)).toEqual([4]);
  });
  it("start row skips old orders", () => {
    expect(mapRows(1, rows, map, 6, products).ok).toHaveLength(0);
    expect(mapRows(1, rows, map, 5, products).ok).toHaveLength(1);
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

describe("real-life sheets", () => {
  it("finds the header row under a title and names empty/duplicate headers", () => {
    const t = table([["طلبات أكتوبر"], [], ["Nom", "", "Prix", "Prix"], ["a", "b", "1", "2"]]);
    expect(t.headerRow).toBe(3);
    expect(t.headers).toEqual(["Nom", "عمود B", "Prix", "Prix (2)"]);
  });
  it("uses the manager's product links", () => {
    const rows = [["Nom", "Tel", "Produit"], ["سارة", "0550123456", "Pyjama motif coeur"], ["علي", "0550123457", "Pyjama motif coeur"], ["منى", "0550123458", "شي حاجة"]];
    const map = { name: "Nom", phone: "Tel", product: "Produit" };
    expect(sheetProducts(rows, map)).toEqual([{ text: "Pyjama motif coeur", n: 2 }, { text: "شي حاجة", n: 1 }]);
    const r = mapRows(1, rows, map, 2, products, { "pyjama motif coeur": "a2" });
    expect(r.ok.map((o) => o.product_id)).toEqual(["a2", "a2", ""]);
    expect(r.ok[0].details).toBe("Pyjama motif coeur");
    expect(r.ok[2].product_name).toBe("شي حاجة");
    expect(r.errors).toHaveLength(0);
  });
});

describe("summary", () => {
  it("groups row errors by cause", async () => {
    const { summarize } = await import("../../lib/sheets/core");
    expect(summarize([
      { reason: 'المنتج "A" ما تربطش بمنتج في الموقع (شوف "ربط المنتجات")' },
      { reason: 'المنتج "B" ما تربطش بمنتج في الموقع (شوف "ربط المنتجات")' },
      { reason: 'الهاتف ماشي صحيح: "12"' },
    ])).toEqual([["المنتج ما تربطش بمنتج في الموقع", 2], ["الهاتف ماشي صحيح", 1]]);
  });
});
