import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("token_blacklist", (table) => {
    table.string("token_hash", 64).primary();
    table.timestamp("expires_at").notNullable();
    table.index("expires_at");
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("token_blacklist");
}
