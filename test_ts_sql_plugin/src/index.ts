import fs from 'fs';
import path from 'path';

import { ApolloServer, gql } from 'apollo-server';
import pg_promise from 'pg-promise';
import { sql, spreadAnd as sql_and, spreadInsert as sql_ins, spreadUpdate as sql_upd } from 'squid/pg';

import * as skm from './skm';

const pgp = pg_promise()(`postgres://username:password@127.0.0.1:32769/username`);

// The GraphQL schema
const typeDefs = gql(fs.readFileSync(path.join(__dirname, '../schema.gql'), 'utf8'));

// A map of functions which return data for the schema.
const resolvers = {
  Book: {
    author: async (root, args, ctx) => {
      return await pgp.one(sql`select * from books where _id=${root._id}`);
    }
  },
  Person: {
    books: async (root, args: skm.Person.books, ctx) => {
      // todo: we need a sql.raw``, then
      // sql`select * from books where author_id=${root._id}${args.title_like ? sql.raw` and title like ${'%'+args.title_like+'%'}` : sql.raw``}${args.publisher ? sql.raw` and publisher=${args.publisher}` : sql.raw``}`;
      // or
      // sql`seelct * from books where 1=1 and ${sql_and({author_id: root._id, publisher: args.publisher})}${args.title_like ? sql.raw` and title like ${'%'+args.title_like+'%'}` : sql.raw``}`
      // todo: rename spreadAnd spreadInsert spreadUpdate to sql, sql.and, sql.ins, sql.upd, sql.raw
      if (args.title_like && args.publisher) {
        return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and title like ${'%'+args.title_like+'%'} and publisher=${args.publisher}`);
      }
      if (args.title_like && !args.publisher) {
        return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and title like ${'%'+args.title_like+'%'}`);
      }
      if (!args.title_like && args.publisher) {
        return await pgp.manyOrNone(sql`select * from books where author_id=${root._id} and publisher=${args.publisher}`);
      }
      return await pgp.manyOrNone(sql`select * from books where author_id=${root._id};`);
    }
  },
  Query: {
    books: async (root, args: skm.Query.books, ctx) => {
      return await pgp.manyOrNone(sql`select * from books where 1=1`);
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


// const a = {
//   "name.like": "xia"
// }

// const a = {
//   name_like: 'xia'
// }
// const b = Object.entries(a).map(([k, v]) => [k.split('_').join('.'), v]).reduce((acc, cv) => ({...acc, [cv[0]]: cv[1]}), {})
