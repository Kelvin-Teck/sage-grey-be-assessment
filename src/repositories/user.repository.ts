import { Knex } from "knex";
import { db } from "../config/database";
import { User } from "../models";

export class UserRepository {
  private tableName = "users";

  async findById(
    id: string,
    trx?: Knex.Transaction,
  ): Promise<User | undefined> {
    const query = trx ? trx(this.tableName) : db(this.tableName);
    return query.where({ id }).first();
  }


  async findByEmail(
    email: string,
    trx?: Knex.Transaction,
  ): Promise<User | undefined> {
    const query = trx ? trx(this.tableName) : db(this.tableName);

    // Normalise before querying — matches regardless of how the caller cased
    // the email, and regardless of how it was stored at registration.
    const normalised = email.toLowerCase().trim();

    return query.whereRaw("LOWER(email) = ?", [normalised]).first();
  }

  async create(
    user: Omit<User, "id" | "created_at" | "updated_at">,
    trx?: Knex.Transaction,
  ): Promise<User> {
    const query = trx ? trx(this.tableName) : db(this.tableName);

    // Normalise email at creation time so all stored emails are lowercase.
  
    const [createdUser] = await query
      .insert({
        email: user.email.toLowerCase().trim(),
        name: user.name,
        password: user.password,
      })
      .returning("*");

    return createdUser;
  }
}
