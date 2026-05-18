import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("transactions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("(gen_random_uuid())"));
    table.uuid("wallet_id").notNullable().references("id").inTable("wallets").onDelete("CASCADE").index();
    table.enum("type", ["deposit", "withdrawal", "transfer_in", "transfer_out"]).notNullable();
    table.decimal("amount", 15, 2).notNullable();
    table.string("reference").unique().notNullable().index();
    table.string("description").notNullable();
    table.uuid("recipient_wallet_id").nullable().references("id").inTable("wallets").onDelete("SET NULL");
    table.enum("status", ["pending", "completed", "failed"]).defaultTo("completed").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("transactions");
}
