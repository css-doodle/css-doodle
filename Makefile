TARGET := ./css-doodle.min.js
LIB := ./node_modules

all: test build minify trim banner

build: $(LIB)
	@npm run build

minify: $(TARGET)
	@npm run minify

banner: $(TARGET)
	@npm run banner

trim: $(TARGET)
	@npm run trim

test:
	@npm run test

$(LIB):
	@npm install

$(TARGET):
	@npm run build

.PHONY: $(TARGET) banner test
