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

$(LIB):
	@npm install
