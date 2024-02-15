// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

import BuildConfiguration from "consts:configuration";
import WasmEnableThreads from "consts:wasmEnableThreads";

import { Module, loaderHelpers, mono_assert, runtimeHelpers } from "./globals";
import { bind_arg_marshal_to_cs } from "./marshal-to-cs";
import { bind_arg_marshal_to_js, end_marshal_task_to_js } from "./marshal-to-js";
import {
    get_sig, get_signature_argument_count,
    bound_cs_function_symbol, get_signature_version, alloc_stack_frame, get_signature_type,
} from "./marshal";
import { MonoMethod, JSFunctionSignature, BoundMarshalerToCs, BoundMarshalerToJs, MarshalerType, MonoAssembly } from "./types/internal";
import cwraps from "./cwraps";
import { assert_js_interop } from "./invoke-js";
import { startMeasure, MeasuredBlock, endMeasure } from "./profiler";
import { bind_assembly_exports, invoke_sync_method } from "./managed-exports";
import { mono_log_debug } from "./logging";

const _assembly_cache_by_name = new Map<string, MonoAssembly>();

export function mono_wasm_bind_cs_function(method: MonoMethod, assemblyName: string, namespaceName: string, shortClassName: string, methodName: string, signatureHash: number, signature: JSFunctionSignature): void {
    const fullyQualifiedName = `[${assemblyName}] ${namespaceName}.${shortClassName}:${methodName}`;
    const mark = startMeasure();
    mono_log_debug(`Binding [JSExport] ${assemblyName}.${shortClassName} from ${assemblyName} assembly`);
    const version = get_signature_version(signature);
    mono_assert(version === 2, () => `Signature version ${version} mismatch.`);


    const args_count = get_signature_argument_count(signature);

    const arg_marshalers: (BoundMarshalerToCs)[] = new Array(args_count);
    for (let index = 0; index < args_count; index++) {
        const sig = get_sig(signature, index + 2);
        const marshaler_type = get_signature_type(sig);
        const arg_marshaler = bind_arg_marshal_to_cs(sig, marshaler_type, index + 2);
        mono_assert(arg_marshaler, "ERR43: argument marshaler must be resolved");
        arg_marshalers[index] = arg_marshaler;
    }

    const res_sig = get_sig(signature, 1);
    let res_marshaler_type = get_signature_type(res_sig);
    const is_async = res_marshaler_type == MarshalerType.Task;
    if (is_async) {
        res_marshaler_type = MarshalerType.TaskPreCreated;
    }
    const res_converter = bind_arg_marshal_to_js(res_sig, res_marshaler_type, 1);

    const closure: BindingClosure = {
        method,
        fullyQualifiedName,
        args_count,
        arg_marshalers,
        res_converter,
        is_async,
        isDisposed: false,
    };
    let bound_fn: Function;
    // void
    if (args_count == 0 && !res_converter) {
        bound_fn = bind_fn_0V(closure);
    }
    else if (args_count == 1 && !res_converter) {
        bound_fn = bind_fn_1V(closure);
    }
    else if (is_async && args_count == 1 && res_converter) {
        bound_fn = bind_fn_1RA(closure);
    }
    else if (is_async && args_count == 2 && res_converter) {
        bound_fn = bind_fn_2RA(closure);
    }
    else if (args_count == 1 && res_converter) {
        bound_fn = bind_fn_1R(closure);
    }
    else if (args_count == 2 && res_converter) {
        bound_fn = bind_fn_2R(closure);
    }
    else {
        bound_fn = bind_fn(closure);
    }

    // this is just to make debugging easier. 
    // It's not CSP compliant and possibly not performant, that's why it's only enabled in debug builds
    // in Release configuration, it would be a trimmed by rollup
    if (BuildConfiguration === "Debug" && !runtimeHelpers.cspPolicy) {
        try {
            bound_fn = new Function("fn", "return (function JSExport_" + methodName + "(){ return fn.apply(this, arguments)});")(bound_fn);
        }
        catch (ex) {
            runtimeHelpers.cspPolicy = true;
        }
    }

    (<any>bound_fn)[bound_cs_function_symbol] = closure;

    _walk_exports_to_set_function(assemblyName, namespaceName, shortClassName, methodName, signatureHash, bound_fn);
    endMeasure(mark, MeasuredBlock.bindCsFunction, fullyQualifiedName);
}

function bind_fn_0V(closure: BindingClosure) {
    const method = closure.method;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_0V() {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(2);
            // call C# side
            invoke_sync_method(method, args);
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn_1V(closure: BindingClosure) {
    const method = closure.method;
    const marshaler1 = closure.arg_marshalers[0]!;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_1V(arg1: any) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(3);
            marshaler1(args, arg1);

            // call C# side
            invoke_sync_method(method, args);
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn_1R(closure: BindingClosure) {
    const method = closure.method;
    const marshaler1 = closure.arg_marshalers[0]!;
    const res_converter = closure.res_converter!;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_1R(arg1: any) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(3);
            marshaler1(args, arg1);

            // call C# side
            invoke_sync_method(method, args);

            const js_result = res_converter(args);
            return js_result;
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn_1RA(closure: BindingClosure) {
    const method = closure.method;
    const marshaler1 = closure.arg_marshalers[0]!;
    const res_converter = closure.res_converter!;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_1R(arg1: any) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(3);
            marshaler1(args, arg1);

            // pre-allocate the promise
            let promise = res_converter(args);

            // call C# side
            invoke_sync_method(method, args);

            // in case the C# side returned synchronously
            promise = end_marshal_task_to_js(args, undefined, promise);

            return promise;
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn_2R(closure: BindingClosure) {
    const method = closure.method;
    const marshaler1 = closure.arg_marshalers[0]!;
    const marshaler2 = closure.arg_marshalers[1]!;
    const res_converter = closure.res_converter!;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_2R(arg1: any, arg2: any) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(4);
            marshaler1(args, arg1);
            marshaler2(args, arg2);

            // call C# side
            invoke_sync_method(method, args);

            const js_result = res_converter(args);
            return js_result;
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn_2RA(closure: BindingClosure) {
    const method = closure.method;
    const marshaler1 = closure.arg_marshalers[0]!;
    const marshaler2 = closure.arg_marshalers[1]!;
    const res_converter = closure.res_converter!;
    const fqn = closure.fullyQualifiedName;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn_2R(arg1: any, arg2: any) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(4);
            marshaler1(args, arg1);
            marshaler2(args, arg2);

            // pre-allocate the promise
            let promise = res_converter(args);

            // call C# side
            invoke_sync_method(method, args);

            // in case the C# side returned synchronously
            promise = end_marshal_task_to_js(args, undefined, promise);

            return promise;
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

function bind_fn(closure: BindingClosure) {
    const args_count = closure.args_count;
    const arg_marshalers = closure.arg_marshalers;
    const res_converter = closure.res_converter;
    const method = closure.method;
    const fqn = closure.fullyQualifiedName;
    const is_async = closure.is_async;
    if (!WasmEnableThreads) (<any>closure) = null;
    return function bound_fn(...js_args: any[]) {
        const mark = startMeasure();
        loaderHelpers.assert_runtime_running();
        mono_assert(!WasmEnableThreads || !closure.isDisposed, "The function was already disposed");
        const sp = Module.stackSave();
        try {
            const args = alloc_stack_frame(2 + args_count);
            for (let index = 0; index < args_count; index++) {
                const marshaler = arg_marshalers[index];
                if (marshaler) {
                    const js_arg = js_args[index];
                    marshaler(args, js_arg);
                }
            }
            let js_result = undefined;
            if (is_async) {
                // pre-allocate the promise
                js_result = res_converter!(args);
            }

            // call C# side
            invoke_sync_method(method, args);
            if (is_async) {
                // in case the C# side returned synchronously
                js_result = end_marshal_task_to_js(args, undefined, js_result);
            }
            else if (res_converter) {
                js_result = res_converter(args);
            }
            return js_result;
        } finally {
            Module.stackRestore(sp);
            endMeasure(mark, MeasuredBlock.callCsFunction, fqn);
        }
    };
}

type BindingClosure = {
    fullyQualifiedName: string,
    args_count: number,
    method: MonoMethod,
    arg_marshalers: (BoundMarshalerToCs)[],
    res_converter: BoundMarshalerToJs | undefined,
    is_async: boolean,
    isDisposed: boolean,
}

export const exportsByAssembly: Map<string, any> = new Map();
function _walk_exports_to_set_function(assembly: string, namespace: string, classname: string, methodname: string, signature_hash: number, fn: Function): void {
    const parts = `${namespace}.${classname}`.replace(/\//g, ".").split(".");
    let scope: any = undefined;
    let assemblyScope = exportsByAssembly.get(assembly);
    if (!assemblyScope) {
        assemblyScope = {};
        exportsByAssembly.set(assembly, assemblyScope);
        exportsByAssembly.set(assembly + ".dll", assemblyScope);
    }
    scope = assemblyScope;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part != "") {
            let newscope = scope[part];
            if (typeof newscope === "undefined") {
                newscope = {};
                scope[part] = newscope;
            }
            mono_assert(newscope, () => `${part} not found while looking up ${classname}`);
            scope = newscope;
        }
    }

    if (!scope[methodname]) {
        scope[methodname] = fn;
    }
    scope[`${methodname}.${signature_hash}`] = fn;
}

export async function mono_wasm_get_assembly_exports(assembly: string): Promise<any> {
    assert_js_interop();
    const result = exportsByAssembly.get(assembly);
    if (!result) {
        await bind_assembly_exports(assembly);
    }

    return exportsByAssembly.get(assembly) || {};
}

export function assembly_load(name: string): MonoAssembly {
    if (_assembly_cache_by_name.has(name))
        return <MonoAssembly>_assembly_cache_by_name.get(name);

    const result = cwraps.mono_wasm_assembly_load(name);
    _assembly_cache_by_name.set(name, result);
    return result;
}