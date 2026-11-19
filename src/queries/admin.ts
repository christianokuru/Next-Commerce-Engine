/** Cross-module reads for the admin dashboard and Admin API. */
import * as product from "@/modules/product/service";
import * as inventory from "@/modules/inventory/service";
import * as order from "@/modules/order/service";
import * as payment from "@/modules/payment/service";
import * as customer from "@/modules/customer/service";

export async function listProductsWithStock(opts: Parameters<typeof product.listProducts>[0]) {
	const r = await product.listProducts(opts);
	const items = await inventory.getItems(r.products.flatMap((p) => p.variants.map((v) => v.id)));
	return {
		...r,
		products: r.products.map((p) => ({
			...p,
			stock: p.variants.reduce((s, v) => s + (items.get(v.id)?.stockedQuantity ?? 0), 0),
		})),
	};
}

export async function getProductDetail(id: string) {
	const p = await product.getProduct(id);
	if (!p) return null;
	const items = await inventory.getItems(p.variants.map((v) => v.id));
	return { ...p, variants: p.variants.map((v) => ({ ...v, inventory: items.get(v.id) ?? null })) };
}
export type ProductDetailWithStock = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export async function listInventory(opts: { lowStockOnly?: boolean } = {}) {
	const items = await inventory.listItems(opts);
	const labels = new Map((await product.getVariantLabels(items.map((i) => i.variantId))).map((l) => [l.variantId, l]));
	return items.filter((i) => labels.has(i.variantId)).map((i) => ({ ...i, ...labels.get(i.variantId)! }));
}

export async function getOrderDetail(id: string) {
	const o = await order.getOrder(id);
	if (!o) return null;
	const [payments, cust] = await Promise.all([payment.listForOrder(id), o.customerId ? customer.getCustomer(o.customerId) : null]);
	return { ...o, payments, customer: cust };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

export async function getCustomerDetail(id: string) {
	const c = await customer.getCustomer(id);
	if (!c) return null;
	const { orders } = await order.listOrders({ customerId: id, limit: 50 });
	return { ...c, orders };
}

export async function dashboard(days = 30) {
	const [sales, customers, low, attention] = await Promise.all([
		order.salesStats(days), customer.countCustomers(), listInventory({ lowStockOnly: true }), payment.listNeedingAttention(),
	]);
	return { ...sales, customers, lowStock: low.slice(0, 8), attention };
}
