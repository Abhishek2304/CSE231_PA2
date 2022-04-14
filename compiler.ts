import { GlobalSetId } from 'binaryen';
import wabt from 'wabt';
import {Stmt, Expr, BinOp, Literal, UniOp} from './ast';
import {parseProgram, traverseExpr} from './parser';
//import { tcProgram } from './tc';
let globalMap = new Map();

export async function run(watSource : string) : Promise<number> {
  const wabtApi = await wabt();

  // Next three lines are wat2wasm
  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, {});

  // This next line is wasm-interp
  return (wasmModule.instance.exports as any)._start();
}

(window as any)["runWat"] = run;

export function codeGenExpr(expr : Expr) : Array<string> {
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const arg1Stmts = codeGenExpr(expr.arg1);
      const arg2Stmts = codeGenExpr(expr.arg2);
      return [...arg1Stmts, ...arg2Stmts, `(call $${expr.name})`];
    case "id": 
      if (globalMap.has(expr.name)){
        return [`(global.get $${expr.name})`];
      }
      else{
        return [`(local.get $${expr.name})`];
      }
    case "literal": return codeGenLiteral(expr.value);
    case "binop":
      const lhsExprs = codeGenExpr(expr.left);
      const rhsExprs = codeGenExpr(expr.right);
      const opStmt = codeGenBinOp(expr.op);
      return [...lhsExprs, ...rhsExprs, opStmt];
    case "uniop":
      const unExprs = codeGenExpr(expr.expr);
      var opExpr : string[];
      switch (expr.op) {
        case UniOp.Neg:
          opExpr = ['(i32.const -1)', '(i32.mul)'];
          break;
        case UniOp.Not:
          opExpr = ['(i32.const 1)', '(i32.xor)'];
          break;
      }
      return unExprs.concat(opExpr);
    case "call":
      const valStmts = expr.arguments.map(codeGenExpr).flat();
      valStmts.push(`(call $${expr.name})`);
      return valStmts;
  }
}

function codeGenBinOp(op: BinOp) : string {
  switch(op){
    case BinOp.Plus:
      return "(i32.add)"
    case BinOp.Minus:
      return "(i32.sub)"
    case BinOp.Mul:
      return "(i32.mul)"
    case BinOp.IDiv:
      return "(i32.div_s)"
    case BinOp.Mod:
      return "(i32.rem_s)"
    case BinOp.Eq:
      return "(i32.eq)"
    case BinOp.Neq:
      return "(i32.ne)"
    case BinOp.Lte:
      return "(i32.le_s)"
    case BinOp.Gte:
      return "(i32.ge_s)"
    case BinOp.Lt:
      return "(i32.lt_s)"
    case BinOp.Gt:
      return "(i32.gt_s)"
  }
}

function codeGenLiteral(literal: Literal): Array<string> {
  switch (literal.tag) {
    case "num":
      return [`(i32.const ${literal.value})`];
    case "bool":
      return [`(i32.const ${Number(literal.value)})`];
    case "none":
      return [`(i32.const 0)`];
  }
}

export function codeGenStmt(stmt : Stmt) : Array<string> {
  switch(stmt.tag) {
    case "define":
      const params = stmt.parameters.map(p => `(param $${p.name} i32)`).join(" ");

      const localVars : Array<string> = [];
      stmt.body.forEach((stmt) => {
        if(stmt.tag === "assign") { localVars.push(stmt.name); }
      });
      const localVarDecls : Array<string> = [];
      localVars.forEach(v => { localVarDecls.push(`(local $${v} i32)`); });

      const stmts = localVarDecls.concat(stmt.body.map(codeGenStmt).flat());
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push("return");
      return valStmts;

    case "assign":
      var bodyWasm = codeGenExpr(stmt.value);
      if (globalMap.has(stmt.name)){
        bodyWasm.push(`(global.set $${stmt.name})`);
      } else{
      bodyWasm.push(`(local.set $${stmt.name})`);
      }
      return bodyWasm;

    case "expr":
      const result = codeGenExpr(stmt.expr);
      return result;

    case "pass":
      return [];

    case "if":
      var condExpr = codeGenExpr(stmt.cond);
      var thenStmts = stmt.thn.map((thnStmt) => codeGenStmt(thnStmt)).flat();
      var elseStmts = stmt.els.map((thnStmt) => codeGenStmt(thnStmt)).flat();
      return condExpr
        .concat(["(if (then"])
        .concat(thenStmts)
        .concat([")", "(else"])
        .concat(elseStmts)
        .concat(["))"]);

    case "while":
      var condExpr = codeGenExpr(stmt.cond);
      const vars : Array<string> = [];
      var bodyStmts = stmt.body.map((bodyStmt) => codeGenStmt(bodyStmt)).flat().join('\n');
      return ["(block (loop (br_if 1"]
        .concat(condExpr)
        .concat(["(i32.eqz))"])
        // .concat(varDecls)
        .concat(bodyStmts)
        .concat(["(br 0) ))"]);
  }
}

export function compile(source : string) : string {
  const ast = parseProgram(source);
  const vars : Array<string> = [];
  ast.forEach((stmt) => {
    if(stmt.tag === "assign") { vars.push(stmt.name);
                                globalMap.set(stmt.name, 0); }
  });
  const funs : Array<string> = [];
  //TODO: put the function definitions here
  ast.forEach((stmt, i) => {
    if(stmt.tag === "define") { funs.push(codeGenStmt(stmt).join("\n")); }
  });
  const allFuns = funs.join("\n\n");
  const stmts = ast.filter((stmt) => stmt.tag !== "define");
  //const stmts = ast;
  
  const globalDecls : Array<string> = [];
  vars.forEach(v => { globalDecls.push(`(global $${v} (mut i32) (i32.const 0))`); });
  const varDecls : Array<string> = [];
  varDecls.push(`(local $scratch i32)`);

  const allStmts = stmts.map(codeGenStmt).flat();
  const ourCode = varDecls.concat(allStmts).join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i32)";
    retVal = ""
  }

  return `
    (module
      ${allFuns}
      ${globalDecls}
      (func (export "_start") ${retType}
        ${ourCode}
        ${retVal}
      )
    ) 
  `;
}