TARGET := ./css-doodle.min.js
LIB := ./node_modules

all: test build

build: $(LIB)
	@npm run build

test:
	@npm run test

$(LIB):
	@npm install

$(TARGET):
	@npm run build

.PHONY: $(TARGET) test build
