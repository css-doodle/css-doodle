# for saving keystrokes

TARGET := ./css-doodle.js
TARGET_MIN := ./css-doodle.min.js
LIB := ./node_modules

all: build minify

build: $(LIB)
	@npm run build

minify: $(TARGET)
	@npm run minify
	@./tools/trim.js $(TARGET_MIN)

test:
	@npm run test
.PHONY: test

$(LIB):
	@npm install
