CREATE TABLE books (
id SERIAL PRIMARY KEY,
	isbn  INTEGER.MAX_VALUE,
	title VARCHAR(50) NOT NULL,
	author VARCHAR(50) NOT NULL,
	rating INTEGER,
	date_read DATE NOT NULL,
	review TEXT,
	route VARCHAR(50) UNIQUE
);


CREATE TABLE notes(
	note_id SERIAL PRIMARY KEY,
	book_id INTEGER REFERENCES books(id),
	note_description TEXT
);

CREATE TABLE users(
id SERIAL PRIMARY KEY,
email VARCHAR(100) NOT NULL UNIQUE,
password VARCHAR(100)
)

INSERT INTO books(title, author, rating, review, date_read, isbn)
	VALUES('1984','Robert',10, 'This was the -read more books that explored the idea of control.', '2024-03-01',978045234)
	 