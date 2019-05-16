-- Drop table

-- DROP TABLE public.persons;

CREATE TABLE public.persons (
	id uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT person_pkey PRIMARY KEY (id)
);


-- Drop table

-- DROP TABLE public.books;

CREATE TABLE public.books (
	id uuid NOT NULL,
	title text NOT NULL,
	publisher text NOT NULL,
	author_id uuid NOT NULL,
	meta json NULL,
	published_at timestamptz NOT NULL,
	CONSTRAINT books_pkey PRIMARY KEY (id),
	CONSTRAINT books_publisher_check CHECK ((publisher = ANY (ARRAY['COLUMBIA_UNIVERSITY_PRESS'::text, 'NANJING_UNIVERSITY_PRESS'::text, 'XXX_PRESS'::text]))),
	CONSTRAINT books_author_id_foreign FOREIGN KEY (author_id) REFERENCES persons(id)
);
