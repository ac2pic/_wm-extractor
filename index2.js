// Useful https://astexplorer.net/
// Babel doc: https://babeljs.io/docs/en/
// tutorial (useful): https://www.sitepoint.com/understanding-asts-building-babel-plugin/


// things to note/fix if ran again:
// Make sure all keys are strings
// Make sure all values (which are string literals are) double quoted
// Make sure to remove all functions

const babel = require('@babel/core');
const fs = require('fs');
const path = "C:/Program Files (x86)/Steam/steamapps/common/CrossCode/assets/js/game.compiled.js";

const data = fs.readFileSync(path, 'utf8');


const ast = babel.parse(data);

function getFullPath(node, computedArr = []) {
	if (!node) {
		return "";
	}
	if (node.type === "MemberExpression") {
		const name = getFullPath(node.object);
		computedArr.push(name);
		if (!node.computed) {
			const prop = node.property;
			if (prop) {
				let propName = node.property.name;
				if (prop.type.indexOf("Literal") > -1)  {
					propName = prop.value;
				}
				if (name) {
					return name + "." + propName;
				} else {
					return propName;
				}
			} 
		} else {
			const prop = getFullPath(node.property, computedArr);
			if (prop) {
				computedArr.push(prop);
			}
			
		}
		
	} else if (node.type === "Identifier"){
		return node.name;
	}
	return "";
}

function getFullPathSpecial(node, computedArr = []) {
	if (!node) {
		return "";
	}
	if (node.type === "MemberExpression") {
		const name = getFullPath(node.object);
		computedArr.push(name);
		if (!node.computed) {
			const prop = node.property;
			if (prop) {
				let propName = node.property.name;
				if (prop.type.indexOf("Literal") > -1)  {
					propName = prop.value;
				}
				if (name) {
					return name + "." + propName;
				} else {
					return propName;
				}
			} 
		} else {
			const prop = getFullPathSpecial(node.property, computedArr);
			if (prop) {
				computedArr.push(prop);
			}
			
		}
		
	} else if (node.type === "Identifier"){
		return node.name;
	} else if (node.type.indexOf("Literal") > -1) {
		return node.value;
	}
	return "";
}


function getFullObjectPropertyPath(nodePath) {
	if (nodePath.node.type === "ObjectProperty") {
		const pathStuff = getFullObjectPropertyPath(nodePath.parentPath);
		const name = nodePath.node.key.name;
		if (name) {
			return `${pathStuff}.${name}`;
		}
		return pathStuff;
		
	} else if (nodePath.node.type === "ObjectExpression") {
		return getFullObjectPropertyPath(nodePath.parentPath);
	}
	return "";
}
const t = babel.types;
function findModuleName(node) {
	const parents = [];
	let parent = node.parentPath;
	do {
		if (parent) {
			parents.push(parent);
			parent = parent.parentPath;
		}
	} while (parent);
	
	do {
		parent = parents.pop();
	} while(parents.length && (parent && parent.type !== "CallExpression"));
	let name = "";
	if (parent) {
		parent.traverse({
			Identifier(path) {
				if (path.node.name === "module") {
					try {
						name = path.parentPath.parentPath.node.arguments[0].value;
					} catch {
						name = "";
					}
				}		
			}
		})
	}
	return name;
}
function generateObjectPath(nameArr, tree) {
	let root = tree;
	
	do {
		const name = nameArr.shift();
		if (!root[name]) {
			root[name] = {}
		}
		root = root[name];
	} while (nameArr.length);
	return root;
}

function generateAssignmentTree() {
	const tree = {};
	

	
	babel.traverse(ast, {
		AssignmentExpression(assignPath) {
			const name = getFullPath(assignPath.node.left);
			if (name) {
				if (assignPath.node.right.type === "ObjectExpression") {
					assignPath.traverse({
						ObjectProperty(propPath) {
							let fullName = name;
							const subFullName = getFullObjectPropertyPath(propPath);
							if (subFullName) {
								fullName += subFullName;
							}
							const root = generateObjectPath(fullName.split("."), tree);
							root.value = propPath;
						}
					});
				} else {
					const root = generateObjectPath(name.split("."), tree);
					
					root.value = assignPath.node.right;
				}
			}
			
		}
	});
	// put all window stuff in the top level too
	if (tree["window"]) {
		const windowSubTree = tree["window"];
		for (let winProp in windowSubTree) {
			if (!tree[winProp]) {
				tree[winProp] = windowSubTree[winProp];
			}
		}
	}

	return tree;
}

function findValueFunction(nameArr) {
	
	// check if the last element is a property
	// of the second last

	let path = root;
	for (const name of nameArr) {
		path = path[name];
	}

	

	// first do a check 
	if (path) {
		const keys = Object.keys(path);
		if (path.value && keys.length === 1) {
			return path.value;
		}
		// remove the value if it's there
		const index = keys.indexOf("value");
		if (index > -1) {
			keys.splice(index, 1);
		}
		return t.arrayExpression(keys.map((e) => t.stringLiteral(e)));
	}

	return null;
}

function resolveObscureReferences(root) {
	// first want to do all ig.merge
	babel.traverse(ast, {
		CallExpression(path) {
		   const node = path.node;
		   const caller = getFullPath(node.callee);
		   if (caller === "ig.merge") {
			   const args = node.arguments;
			   if (args.length === 2) {
				   const assignee = args[0];
				   if (assignee.type === "MemberExpression") {
					   const objName = getFullPath(assignee);
					   const ref = generateObjectPath(objName.split("."), root);
					   ref.value = args[1];
				   }   
			   }
			}   
	   },
	   AssignmentExpression(path) {
			const arr = [];   
			const value = getFullPathSpecial(path.node.left, arr);
			const search = ["sc.GROUP_SWITCH_TYPE", "sc.ACTOR_SOUND"];
			if(value === "" && arr.length > 1) {
				for (const item of search) {
					if (item === arr[0]) {
						generateObjectPath(arr[0].split(".").concat(arr[1]), root);
					}
				}
				if (arr[0] === "sc.FOOD_SPRITE") {
					arr.pop();
					const instance = path.scope.getBinding(arr[arr.length - 1]);
					const init = instance.path.node.init;
					const ref = generateObjectPath(arr[0].split("."), root);
					ref.value = init;
				}
			} else if (search.indexOf(value) > -1) {
				generateObjectPath(value.split("."), root);
			}
		}
   });
}

function getVarKeys(node) {
	if (node.type === "ObjectExpression") {
		return t.arrayExpression(node.properties.map((e) => {
			const key = e.key;
			if (key.name) {
				return t.Identifier(`"${key.name}"`);
			}
			return t.Identifier(`"${key.value}"`);
			}));
		} else if (node.type === 'ArrayExpression') {
			return node;
		}
    return null;
}

const root = generateAssignmentTree();
resolveObscureReferences(root);
const properties = []; 

babel.traverse(ast, {
	AssignmentExpression(assignPath) {
		assignPath.traverse({
			ObjectProperty(path) {
				if (path.node.key.name === "_wm") {
					// I need the full path
					let fullPath = getFullPath(assignPath.node.left);
					const blacklist = [
						"sc.StoneInfo",
						"sc.BallInfo",
						"ig.ParallaxGui",
						"ig.MapImageEntity"
					];

					if (blacklist.indexOf(fullPath) > -1) {
						return;
					}

					let expression = null;
					const specialTypes = [
						"sc.COMMON_EVENT_TYPE",
						"sc.AREA_ICONS"
					];

					let isSpecial = false
					   ,isExtraSpecial = false;
					const entries = [
						"ENTITY",
						"ACTION_STEP",
						"EVENT_STEP",
						"EFFECT_ENTRY",
						"GUI",
						"QUEST_SUB_TASK",
						"COMBAT_CONDITION",
						"COMBAT_SHIELDS",
						"COMBAT_POI",
						"BALL_BEHAVIOR",
						"PROXY_TYPE",
						"COMBAT_SHIELDS",
						"COMBAT_STUN",
						"ENEMY_REACTION",
						"COMBAT_ENEMY_EVENT",
						"ENEMY_TRACKER",
						"NpcState",
						"CompressedWaveEntity",
						"CompressedShockEntity",
						"BALL_CHANGER_TYPE",
						"ElementShieldBallEntity",
						"COMMON_EVENT_TYPE"
					];
					
					let extraSpecial = ["sc.AREA_ICONS"];
					if (extraSpecial.indexOf(fullPath) > -1) {
						isExtraSpecial = true;
					}
					
					if (specialTypes.indexOf(fullPath) > -1) {
						isSpecial = true;
						fullPath += getFullObjectPropertyPath(path.parentPath);
					}
					
					// temp1.parentPath.node.key.name
					// 
					let found = false;
					if (!isExtraSpecial) {
						for (const entry of entries) {
							if (fullPath.indexOf(entry) > -1) {
								found = true;
								path.traverse({
									ObjectProperty(actionPath) {
										const leftId = actionPath.node.key;
										const rightId = actionPath.node.value;
										actionPath.traverse({
											Identifier(idPath) {
												if(idPath.node === leftId) {
													let newName = idPath.node.name; 
													if (idPath.node.name.startsWith("_")) {
														newName = idPath.node.name.substring(1);
													} 
													
													if (!idPath.node.name.startsWith('"')) {
														newName = `"${newName}"`;
														idPath.replaceWith(t.Identifier(newName));
													}
												}
												if (idPath.node === rightId) {
													let scope = isSpecial ? assignPath.scope : actionPath.scope;
													if (idPath.node.name.length === 1) {
														const name = scope.getBinding(idPath.node.name);
														if (!name) {
															console.log('Could not find binging...', idPath.node.name);
														} else {
															const node = name.path.node;
															if (node.init) {
																const replace = getVarKeys(node.init);
																if (replace) {
																	idPath.replaceWith(replace);
																}
																
															}
														}
													} else {
														const value = findValueFunction([idPath.node.name]);
														if (value) {
															idPath.replaceWith(value);
														}
													}
												}
											}
										});
										if (actionPath.node.key.name === "\"attributes\"") {		
											// if it ends up here
											// look for member expressions
											const foundMember = false;
											actionPath.traverse({
												MemberExpression(expPath) {
													let parentPath = expPath;
													
													let replacement = null;
													while (parentPath.type === "MemberExpression") {
														parentPath = parentPath.parentPath;
													}
													
													if (!parentPath.node.key) {
														return;
													}

													const parentKeyName  = parentPath.node.key.name;
													const keyName = t.Identifier(parentKeyName);
													const objectName = getFullPath(parentPath.node.value);
													if (objectName) {
														
													
														const nameSplit = objectName.split(".");
														if (nameSplit[0].length > 1 && parentKeyName !== "_default") {
															replacement = findValueFunction(nameSplit); 
	
															if (replacement) {
																if (replacement.type !== "ObjectProperty") {
																	parentPath.replaceWith(t.objectProperty(keyName, replacement));
																} else {
																	parentPath.replaceWith(t.objectProperty(keyName, replacement.node.value));
																}
																
															}
														} else if (nameSplit.length > 1) {
															debugger;
															parentPath.replaceWith(t.objectProperty(keyName, t.Identifier(`"${nameSplit[nameSplit.length - 1]}"`)));
														}
														
														
														
													}
													
												}
											});
											expression = t.objectExpression([actionPath.node]);
										}
										
									}
								});	
								break;
							}
						}	
					}
					if (!found && !isExtraSpecial) {
						// ig.MAP.*
						// ig.MapImageEntity
						expression = [];
						path.traverse({
							ObjectProperty(actionPath) {
								// left values only
								const leftId = actionPath.node.key;
								const rightId = actionPath.node.value;
								actionPath.traverse({
									Identifier(idPath) {
										if(idPath.node === leftId) {
											let newName = idPath.node.name; 
											if (idPath.node.name.startsWith("_")) {
												newName = idPath.node.name.substring(1);
											} 
											
											if (!idPath.node.name.startsWith('"')) {
												newName = `"${newName}"`;
												idPath.replaceWith(t.Identifier(newName));
											}
										}
										if (idPath.node === rightId) {
											let scope = isSpecial ? assignPath.scope : actionPath.scope;
											if (idPath.node.name.length === 1) {
												const name = scope.getBinding(idPath.node.name);
												if (!name) {
													console.log('Could not find binging...', idPath.node.name);
												} else {
													const node = name.path.node;
													if (node.init) {
														const replace = getVarKeys(node.init);
														if (replace) {
															idPath.replaceWith(replace);
														}
														
													}
												}
											} else {
												const value = findValueFunction([idPath.node.name]);
												idPath.replaceWith(value);
											}
										}
										
									},
									MemberExpression(expPath) {
										let parentPath = expPath;
										let replacement = null;
										
										while (parentPath.type === "MemberExpression") {
											parentPath = parentPath.parentPath;
										}

										if (!parentPath.node.key) {
											return;
										}

										const keyName = t.Identifier(parentPath.node.key.name);
										const objectName = getFullPath(parentPath.node.value);
										if (objectName) {
											replacement = findValueFunction(objectName.split(".")); 
											if (replacement) {
												if (replacement.type !== "ObjectProperty") {
													parentPath.replaceWith(t.objectProperty(keyName, replacement));
												} else {
													parentPath.replaceWith(t.objectProperty(keyName, replacement.node.value));
												}
												
											}
											
											
										}
										
									}
								});
								if (expression.indexOf(actionPath.node) === -1) {
									expression.push(actionPath.node);
								}
							}
						});

						expression = t.objectExpression(expression)
					}
					if (isExtraSpecial) {
						// these only have _wm and no attributes field
						// so have to 
						expression = [];
						path.traverse({
							ObjectProperty(actionPath) {
								const leftId = actionPath.node.key;
								const rightId = actionPath.node.value;
								actionPath.traverse({
									Identifier(idPath) {
										if(idPath.node === leftId) {
											let newName = idPath.node.name; 
											if (idPath.node.name.startsWith("_")) {
												newName = idPath.node.name.substring(1);
											} 
											
											if (!idPath.node.name.startsWith('"')) {
												newName = `"${newName}"`;
												idPath.replaceWith(t.Identifier(newName));
											}
										}
										if (idPath.node === rightId) {
											let scope = isSpecial ? assignPath.scope : path.scope;
											if (idPath.node.name.length === 1) {
												const name = scope.getBinding(idPath.node.name);
												if (!name) {
													console.log('Could not find binging...', idPath.node.name);
												} else {
													const node = name.path.node;
													if (node.init) {
														const replace = getVarKeys(node.init);
														if (replace) {
															idPath.replaceWith(replace);
														}
														
													}
												}
											} else {
												const value = findValueFunction([idPath.node.name]);
												idPath.replaceWith(value);
											}
										}
									}
								});
								// if it ends up here
								// look for member expressions
								const foundMember = false;
								actionPath.traverse({
									MemberExpression(expPath) {
										let parentPath = expPath;
										
										let replacement = null;
										while (parentPath.type === "MemberExpression") {
											parentPath = parentPath.parentPath;
										}
										
										if (!parentPath.node.key) {
											return;
										}

										const keyName = t.Identifier(parentPath.node.key.name);
										const objectName = getFullPath(parentPath.node.value);
										if (objectName) {
											replacement = findValueFunction(objectName.split(".")); 

											if (replacement) {
												if (replacement.type !== "ObjectProperty") {
													parentPath.replaceWith(t.objectProperty(keyName, replacement));
												} else {
													parentPath.replaceWith(t.objectProperty(keyName, replacement.node.value));
												}
												
											}
																			
										}
									}
								});
							}
						});
						expression = path.node.value;
					}

					if (expression) {
						properties.push(t.ObjectProperty(t.Identifier(`"${fullPath}"`), expression));
					}
				}
			}
		})
  	}
});
const dec = t.variableDeclaration('let', [t.variableDeclarator(t.Identifier('d'),t.objectExpression(properties))]);

const program = t.program([dec]);

let code = babel.transformFromAstSync(program).code;


code = code.replace('let d = ', '');
code = code.substring(0, code.length - 1);

fs.writeFileSync('data.json', code , 'utf8');

// [^\"]sc\.