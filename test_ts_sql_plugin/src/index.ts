import fs from 'fs';
import path from 'path';

import { ApolloServer, gql } from 'apollo-server';
import pg_promise from 'pg-promise';

import sql from '../../src/sql';

import * as skm from './skm';

const pgp = pg_promise()(`postgres://username:password@127.0.0.1:32769/username`);

// The GraphQL schema
const typeDefs = gql(fs.readFileSync(path.join(__dirname, '../schema.gql'), 'utf8'));

// A map of functions which return data for the schema.
const resolvers = {
  Book: {
    author: async (root, args, ctx) => {
      return await pgp.one(sql`select * from persons where id=${root.author_id}`);
    },
  },
  Person: {
    books: async (root, args: skm.Person.books, ctx) => {
      // todo: we need a sql.raw``, then
      // sql`select * from books where author_id=${root._id}${args.title_like ? sql.raw` and title like ${'%'+args.title_like+'%'}` : sql.raw``}${args.publisher ? sql.raw` and publisher=${args.publisher}` : sql.raw``}`;
      // or
      // sql`seelct * from books where 1=1 and ${sql_and({author_id: root._id, publisher: args.publisher})}${args.title_like ? sql.raw` and title like ${'%'+args.title_like+'%'}` : sql.raw``}`
      // todo: rename spreadAnd spreadInsert spreadUpdate to sql, sql.and, sql.ins, sql.upd, sql.raw
      // if (args.title_like && args.publisher) {
      //   return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and title like ${'%'+args.title_like+'%'} and publisher=${args.publisher}`);
      // }
      // if (args.title_like && !args.publisher) {
      //   return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and title like ${'%'+args.title_like+'%'}`);
      // }
      // if (!args.title_like && args.publisher) {
      //   return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and publisher=${args.publisher}`);
      // }
      // return await pgp.manyOrNone(sql`select * from books where author_id=${root._id};`);

      // return await pgp.manyOrNone(sql`select * from books where ${sql.and({author_id: root._id, publisher: args.publisher})}${sql.cond(!!args.title_like)` and title like ${'%'+args.title_like+'%'}`}`);
      // or
      return await pgp.manyOrNone(sql`select * from books where ${sql.and({ author_id: root._id, publisher: args.publisher, 'title like': args.title_like ? `%${args.title_like}%` : undefined })}`);
    },
  },
  Query: {
    books: async (root, args: skm.Query.books, ctx) => {
      return await pgp.manyOrNone(
        sql`select * from books${sql.cond(Object.entries(args).filter(([k, v]) => v).length > 0)` where ${sql.and({
          author_id: args.author_id,
          publisher: args.publisher,
          'title like': args.title_like ? `%${args.title_like}%` : undefined,
        })}`}`,
      );
    },
    persons: async (root, args: skm.Query.persons, ctx) => {
      return await pgp.manyOrNone(sql`select * from persons${sql.cond(!!args.name_like)` where name like ${`%${args.name_like}%`}`}`);
    },
  },
  Mutation: {
    add_person: async (root, args: skm.Mutation.add_person) => {
      return await pgp.one(sql`insert into personns ${sql.ins({first_name: args.name})}`);
    },
    add_book: async (root, args: skm.Mutation.add_book) => {
      return await pgp.one(sql`insert into books ${sql.ins(args)}`);
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
