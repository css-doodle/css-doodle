# for saving keystrokes

TARGET := ./css-doodle.js
TARGET_MIN := ./css-doodle.min.js
LIB := ./node_modules

all: build minify

build: $(LIB)
	@npm run build
	@./tools/tab2spaces $(TARGET)

minify: $(TARGET)
	@npm run minify
	@./tools/trim $(TARGET_MIN)
	@cp $(TARGET_MIN) docs/lib/

$(LIB):
	@npm install

docs:
	@git subtree push --prefix docs/ origin gh-pages
.PHONY: docs
