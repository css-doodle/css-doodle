# for saving keystrokes

TARGET := ./css-doodle.js
LIB := ./node_modules

build: $(LIB)
	@npm run build
	@sed -i "" $$'s/\t/  /' $(TARGET)
	@cp $(TARGET) docs/

$(LIB):
	@npm install

docs:
	@git subtree push --prefix docs/ origin gh-pages
.PHONY: docs
