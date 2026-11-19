import { relations } from "drizzle-orm";
import { user } from "../modules/auth/schema";
import {
	products, productVariants, productVariantPrices, productImages, productOptions,
	productCategories, productCollections, productCategoryLinks,
} from "../modules/product/schema";
import { inventoryLevels } from "../modules/inventory/schema";
import { customers, customerAddresses } from "../modules/customer/schema";
import { carts, cartLineItems } from "../modules/cart/schema";
import { shippingZones, shippingOptions } from "../modules/shipping/schema";
import { promotions } from "../modules/promotion/schema";
import { orders, orderLineItems, orderEvents } from "../modules/order/schema";
import { payments, refunds } from "../modules/payment/schema";

export const productsRelations = relations(products, ({ many, one }) => ({
	variants: many(productVariants),
	images: many(productImages),
	options: many(productOptions),
	categoryLinks: many(productCategoryLinks),
	collection: one(productCollections, { fields: [products.collectionId], references: [productCollections.id] }),
}));

export const variantsRelations = relations(productVariants, ({ one, many }) => ({
	product: one(products, { fields: [productVariants.productId], references: [products.id] }),
	prices: many(productVariantPrices),
	inventory: one(inventoryLevels, { fields: [productVariants.id], references: [inventoryLevels.variantId] }),
}));

export const pricesRelations = relations(productVariantPrices, ({ one }) => ({
	variant: one(productVariants, { fields: [productVariantPrices.variantId], references: [productVariants.id] }),
}));

export const imagesRelations = relations(productImages, ({ one }) => ({
	product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const optionsRelations = relations(productOptions, ({ one }) => ({
	product: one(products, { fields: [productOptions.productId], references: [products.id] }),
}));

export const categoriesRelations = relations(productCategories, ({ one, many }) => ({
	parent: one(productCategories, { fields: [productCategories.parentId], references: [productCategories.id], relationName: "tree" }),
	children: many(productCategories, { relationName: "tree" }),
	productLinks: many(productCategoryLinks),
}));

export const categoryLinksRelations = relations(productCategoryLinks, ({ one }) => ({
	product: one(products, { fields: [productCategoryLinks.productId], references: [products.id] }),
	category: one(productCategories, { fields: [productCategoryLinks.categoryId], references: [productCategories.id] }),
}));

export const collectionsRelations = relations(productCollections, ({ many }) => ({
	products: many(products),
}));

export const inventoryRelations = relations(inventoryLevels, ({ one }) => ({
	variant: one(productVariants, { fields: [inventoryLevels.variantId], references: [productVariants.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
	user: one(user, { fields: [customers.userId], references: [user.id] }),
	addresses: many(customerAddresses),
	orders: many(orders),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
	customer: one(customers, { fields: [customerAddresses.customerId], references: [customers.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
	items: many(cartLineItems),
	customer: one(customers, { fields: [carts.customerId], references: [customers.id] }),
	shippingOption: one(shippingOptions, { fields: [carts.shippingOptionId], references: [shippingOptions.id] }),
	promotion: one(promotions, { fields: [carts.promotionId], references: [promotions.id] }),
}));

export const cartItemsRelations = relations(cartLineItems, ({ one }) => ({
	cart: one(carts, { fields: [cartLineItems.cartId], references: [carts.id] }),
	variant: one(productVariants, { fields: [cartLineItems.variantId], references: [productVariants.id] }),
}));

export const shippingZonesRelations = relations(shippingZones, ({ many }) => ({
	options: many(shippingOptions),
}));

export const shippingOptionsRelations = relations(shippingOptions, ({ one }) => ({
	zone: one(shippingZones, { fields: [shippingOptions.zoneId], references: [shippingZones.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	items: many(orderLineItems),
	events: many(orderEvents),
	payments: many(payments),
	customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
}));

export const orderItemsRelations = relations(orderLineItems, ({ one }) => ({
	order: one(orders, { fields: [orderLineItems.orderId], references: [orders.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
	order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
	order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
	refunds: many(refunds),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
	payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
}));
