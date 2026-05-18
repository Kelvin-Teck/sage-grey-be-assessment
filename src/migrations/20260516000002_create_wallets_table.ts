import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("wallets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("(gen_random_uuid())"));
    table.uuid("user_id").notNullable().unique().references("id").inTable("users").onDelete("CASCADE").index();
    table.decimal("balance", 15, 2).defaultTo(0.00).notNullable();
    table.string("currency").defaultTo("NGN").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("wallets");
}
