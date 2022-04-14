import { TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import {Stmt, Expr, UniOp, BinOp, Literal, Type, Parameter} from './ast';

var checkArray : Array<string> = [];

export function parseProgram(source : string) : Array<Stmt> {
  const t = parser.parse(source).cursor();
  return traverseStmts(source, t);
}

export function traverseStmts(s : string, t : TreeCursor) {
  // The top node in the program is a Script node with a list of children
  // that are various statements
  t.firstChild();
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));
  } while(t.nextSibling()); // t.nextSibling() returns false when it reaches
                            //  the end of the list of children
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s : string, t : TreeCursor) : Stmt {
  
  switch(t.type.name) {
    
    case "AssignStatement":
      t.firstChild(); // go to name
      const name = s.substring(t.from, t.to);
      t.nextSibling(); // go to equals
      t.nextSibling(); // go to value
      const value = traverseExpr(s,t);
      t.parent();
      checkArray.push(name);
      return {
        tag: "assign",
        name: name,
        value: value
      }

    case "IfStatement":
      t.firstChild();
      t.nextSibling(); 
      var cond = traverseExpr(s, t);
      t.nextSibling();
      t.firstChild();
      var thenStmts = [];
      while (t.nextSibling()) {
        thenStmts.push(traverseStmt(s, t));
      }
      t.parent();

      if (!t.nextSibling()) {
        throw new Error("Cannot parse without else block");
      }
      t.nextSibling(); 
      t.firstChild(); 
      var elseStmts = [];
      while (t.nextSibling()) {
        elseStmts.push(traverseStmt(s, t));
      }
      t.parent();
      t.parent();
      return {
        tag: "if",
        cond: cond,
        thn: thenStmts,
        els: elseStmts,
      };

    case "ReturnStatement":
      t.firstChild();
      var ret_value: Expr;
      if (t.nextSibling()){
        ret_value = traverseExpr(s,t);
      }
      // Handle just the return, no value
      else{
        ret_value = {tag: "literal", value: { tag: "none" } };
      }
      t.parent();
      return {tag: "return", value: ret_value}

    case "ExpressionStatement":
      t.firstChild(); 
      var exprStmtName = traverseExpr(s, t);
      t.parent();
      return {tag: "expr", expr: exprStmtName };

    case "PassStatement":
      return {tag: "pass"};

    case "WhileStatement":
      t.firstChild();
      t.nextSibling();
      const condition = traverseExpr(s,t);
      t.nextSibling();

      var bodyStmts : Array<Stmt> = [];
      t.firstChild();
      while (t.nextSibling()){
        bodyStmts.push(traverseStmt(s, t));
      }
      t.parent();
      t.parent();
      return {
        tag: "while",
        cond: condition,
        body: bodyStmts
      }

    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var func_name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var parameters = traverseParameters(s, t)
      t.nextSibling(); // Focus on Body or TypeDef
      let ret : Type = "none";
      let maybeTD = t;
      if(maybeTD.type.name === "TypeDef") {
        t.firstChild();
        ret = traverseType(s, t);
        t.parent();
      }
      t.nextSibling(); // Focus on single statement (for now)
      t.firstChild();  // Focus on :
      const body = [];
      while(t.nextSibling()) {
        body.push(traverseStmt(s, t));
      }
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      return {
        tag: "define",
        name: func_name, parameters, body, ret
      }
      
  }
}

// TODO: Define Callexpr (Function calls and builtins for traverse Expr)
export function traverseExpr(s : string, t : TreeCursor) : Expr {
  switch(t.type.name) {
    case "Number":
      return { tag: "literal", value: traverseLiteral(s,t)};
    case "Boolean":
      return { tag: "literal", value: traverseLiteral(s,t)};
    case "None":
      return { tag: "literal", value: traverseLiteral(s,t)};
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };

    case "BinaryExpression":
      t.firstChild(); 
      const lExpr = traverseExpr(s,t);
      t.nextSibling(); 
      var opExpr = s.substring(t.from, t.to);
      var op;
      switch (opExpr) {
        case "+":
          op = BinOp.Plus;
          break;
        case "-":
          op = BinOp.Minus;
          break;
        case "*":
          op = BinOp.Mul;
          break;
        case "//":
          op = BinOp.IDiv;
          break;
        case "%":
          op = BinOp.Mod;
          break;
        case "==":
          op = BinOp.Eq;
          break;
        case "!=":
          op = BinOp.Neq;
          break;
        case "<=":
          op = BinOp.Lte;
          break;
        case ">=":
          op = BinOp.Gte;
          break;
        case "<":
          op = BinOp.Lt;
          break;
        case ">":
          op = BinOp.Gt;
          break;
        case "is":
          op = BinOp.Is;
          break;
        default:
          throw new Error("ParseError: Given Binary expression not supported");
      }
      t.nextSibling();
      const rExpr = traverseExpr(s, t);
      t.parent();
      return {
        tag: "binop",
        op: op,
        left: lExpr,
        right: rExpr,
      };  

    case "ParenthesizedExpression":
      t.firstChild();
      t.nextSibling();
      var expr = traverseExpr(s,t);
      t.parent();
      return expr;

    case "UnaryExpression":
      t.firstChild();
      var opExpr = s.substring(t.from, t.to);
      var op;
      switch (opExpr) {
        case "-":
          op = UniOp.Neg;
          break;
        case "not":
          op = UniOp.Not;
          break;
        default:
          throw new Error("ParseError: Given Unary expression not supported");
        }
      t.nextSibling();
      const exprValue = traverseExpr(s, t);
      t.parent();
      return {
        tag: "uniop",
        op: op,
        expr: exprValue,
      };

      case "CallExpression":
        t.firstChild();
        const callName = s.substring(t.from, t.to);
        t.nextSibling();
        var args = traverseArguments(t, s);
        if (args.length == 1){
          if (callName !== "abs" && callName !== "print"){
            t.parent();
            return {
              tag: "call",
              name: callName,
              arguments: args,
            }
          }
          
          t.parent(); // pop CallExpression
          return {
            tag: "builtin1",
            name: callName,
            arg: args[0]
          };
        } else if (args.length == 2) {
          if (callName !== "max" && callName !== "min" && callName !== "pow"){
            t.parent();
            return {
              tag: "call",
              name: callName,
              arguments: args,
            }
          }
            
          t.parent(); // pop CallExpression
          return {
            tag: "builtin2",
            name: callName,
            arg1: args[0],
            arg2: args[1]
          };
        } else {
          return {
            tag: "call",
            name: callName,
            arguments: args,
          }
        }
  }
}

export function traverseLiteral(s: string, t: TreeCursor): Literal {
  switch (t.type.name) {
    case "Number":
      return {
        tag: "num",
        value: Number(s.substring(t.from, t.to)),
      };
    case "BooleanLiteral":
      return {
        tag: "bool",
        value: s.substring(t.from, t.to) === "true",
      };
    case "None":
      return {
        tag: "none",
      };
    default:
      throw new Error("Cannot Parse Literal");
  }
}

export function traverseArguments(c : TreeCursor, s : string) : Expr[] {
  c.firstChild();  // Focuses on open paren
  const args = [];
  c.nextSibling();
  while(c.type.name !== ")") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  } 
  c.parent();       // Pop to ArgList
  return args;
}

export function traverseType(s : string, t : TreeCursor) : Type {
  switch(t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      if(name !== "int" && name !== "bool") {
        throw new Error("Unknown type: " + name)
      }
      return name;
    default:
      throw new Error("Unknown type: " + t.type.name)

  }
}

export function traverseParameters(s : string, t : TreeCursor) : Array<Parameter> {
  t.firstChild();  // Focuses on open paren
  const parameters = []
  t.nextSibling(); // Focuses on a VariableName
  while(t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
    let nextTagName = t.type.name; 
    if(nextTagName !== "TypeDef") { throw new Error("Missed type annotation for parameter " + name)};
    t.firstChild();  // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    let typ = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({name, typ});
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent();       // Pop to ParamList
  return parameters;
}
