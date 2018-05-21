# for saving keystrokes

TARGET := ./css-doodle.js
TARGET_MIN := ./css-doodle.min.js
LIB := ./node_modules

all: test build minify

build: $(LIB)
	@npm run build
	@./tools/tab2spaces $(TARGET)

minify: $(TARGET)
	@npm run minify
	@./tools/trim $(TARGET_MIN)

test:
	@npm run test
.PHONY: test

$(LIB):
	@npm install
