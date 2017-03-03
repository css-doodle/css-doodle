# for saving keystrokes

LIB := ./node_modules

build: $(LIB)
	@npm run build
	@sed -i "" $$'s/\t/  /' css-doodle.js
	@cp css-doodle.js docs/

$(LIB):
	@npm install

docs:
	@npm run docs
.PHONY: docs
