// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Runtime.CompilerServices;

namespace System
{
    public partial class MathF
    {
        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Acos(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Acosh(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Asin(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Asinh(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Atan(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Atan2(float y, float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Atanh(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Cbrt(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Ceiling(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Cos(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Cosh(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Exp(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Floor(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Log(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Log10(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Pow(float x, float y);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Sin(float x);

        public static (float Sin, float Cos) SinCos(float x) => (Sin(x), Cos(x));

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Sinh(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Sqrt(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Tan(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Tanh(float x);

        [Intrinsic]
        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float FusedMultiplyAdd(float x, float y, float z);

        [MethodImpl(MethodImplOptions.InternalCall)]
        public static extern float Log2(float x);

        [MethodImpl(MethodImplOptions.InternalCall)]
        private static extern unsafe float ModF(float x, float* intptr);
    }
}
