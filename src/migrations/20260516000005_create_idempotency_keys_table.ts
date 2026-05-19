import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("idempotency_keys", (table) => {
    table.string("key", 300).primary();
    table.string("user_id").notNullable();
    table.string("request_path").notNullable();
    table.text("response_body");
    table.integer("response_status");
    table.string("execution_status", 50).notNullable().defaultTo("in_progress");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.index("user_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotency_keys");
}
