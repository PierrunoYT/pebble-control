# Pebble Control audio bridge.
#
# Runs as a long-lived child of the main process and answers one JSON command
# per line on stdin with one JSON line on stdout. It reaches Windows Core Audio
# through COM for what the loudness package does not cover: capture endpoint
# level, mute, default device, and shared-mode format, render endpoint listing,
# and the per-endpoint system effects store that Creative's driver reads.
# Operations: list, list-render, state, set-volume, set-mute, set-default,
# formats, set-format, effects-get, effects-set, ping.

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;

namespace PebbleAudio
{
    public enum EDataFlow { Render, Capture, All }
    public enum ERole { Console, Multimedia, Communications }

    [StructLayout(LayoutKind.Sequential)]
    public struct PropertyKey
    {
        public Guid fmtid;
        public int pid;
        public PropertyKey(Guid f, int p) { fmtid = f; pid = p; }
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct PropVariant
    {
        [FieldOffset(0)] public short vt;
        [FieldOffset(8)] public IntPtr pointerValue;
        [FieldOffset(8)] public int intValue;
    }

    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(EDataFlow flow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(EDataFlow flow, ERole role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumerator { }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
        [PreserveSig] int GetChannelCount(out int count);
        [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid context);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
        [PreserveSig] int GetMasterVolumeLevel(out float db);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(int channel, float db, ref Guid context);
        [PreserveSig] int SetChannelVolumeLevelScalar(int channel, float level, ref Guid context);
        [PreserveSig] int GetChannelVolumeLevel(int channel, out float db);
        [PreserveSig] int GetChannelVolumeLevelScalar(int channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        [PreserveSig] int GetVolumeStepInfo(out int step, out int count);
        [PreserveSig] int VolumeStepUp(ref Guid context);
        [PreserveSig] int VolumeStepDown(ref Guid context);
        [PreserveSig] int QueryHardwareSupport(out int mask);
        [PreserveSig] int GetVolumeRange(out float min, out float max, out float step);
    }

    [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, int flags, long duration, long period, IntPtr format, IntPtr session);
        [PreserveSig] int GetBufferSize(out int frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out int padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closest);
    }

    // Undocumented but stable since Windows Vista; used by every "set default
    // audio device" tool. Windows 10 and 11 expose this interface ID.
    [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr format);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int useDefault, out IntPtr format);
        [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr endpointFormat, IntPtr mixFormat);
        [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int useDefault, out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, ref long period);
        [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
        [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr mode);
        [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.Bool)] bool fxStore, ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.Bool)] bool fxStore, ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, ERole role);
        [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.Bool)] bool visible);
    }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    public class PolicyConfigClient { }

    // Windows 11 per-endpoint store for audio processing object settings. Creative's
    // Acoustic Engine reads its parameters from the user store for a context GUID.
    [Guid("302AE7F9-D7E0-43E4-971B-1F8293613D2A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSystemEffectsPropertyStore
    {
        [PreserveSig] int OpenDefaultPropertyStore(uint access, out IRawPropertyStore store);
        [PreserveSig] int OpenUserPropertyStore(uint access, out IRawPropertyStore store);
        [PreserveSig] int OpenVolatilePropertyStore(uint access, out IRawPropertyStore store);
        [PreserveSig] int ResetUserPropertyStore();
        [PreserveSig] int ResetVolatilePropertyStore();
        [PreserveSig] int RegisterPropertyChangeNotification(IntPtr client);
        [PreserveSig] int UnregisterPropertyChangeNotification(IntPtr client);
    }

    // IPropertyStore again, but with raw buffers so PROPERTYKEY and PROPVARIANT
    // layouts are handled byte for byte.
    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IRawPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, IntPtr key);
        [PreserveSig] int GetValue(IntPtr key, IntPtr value);
        [PreserveSig] int SetValue(IntPtr key, IntPtr value);
        [PreserveSig] int Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct WaveFormatExtensible
    {
        public ushort formatTag;
        public ushort channels;
        public uint samplesPerSec;
        public uint avgBytesPerSec;
        public ushort blockAlign;
        public ushort bitsPerSample;
        public ushort extraSize;
        public ushort validBitsPerSample;
        public uint channelMask;
        public Guid subFormat;
    }

    public class CaptureDevice
    {
        public string Id;
        public string Name;
        public string Interface;
        public bool IsDefault;
    }

    public class Format
    {
        public int Bits;
        public int Rate;
        public int Channels;
    }

    public static class Capture
    {
        static readonly Guid PcmSubtype = new Guid("00000001-0000-0010-8000-00aa00389b71");
        static readonly Guid VolumeInterface = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static readonly Guid ClientInterface = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        static readonly PropertyKey FriendlyName = new PropertyKey(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 14);
        static readonly PropertyKey InterfaceName = new PropertyKey(new Guid("b3f8fa53-0004-438e-9003-51a46e139bfc"), 6);
        const int ActiveState = 1;
        const int ClsCtxAll = 23;

        static IMMDeviceEnumerator Enumerator() { return (IMMDeviceEnumerator)new MMDeviceEnumerator(); }

        static string ReadString(IPropertyStore store, PropertyKey key)
        {
            PropVariant value;
            if (store.GetValue(ref key, out value) != 0 || value.vt != 31) return "";
            return Marshal.PtrToStringUni(value.pointerValue);
        }

        static string DefaultId(EDataFlow flow)
        {
            IMMDevice device;
            if (Enumerator().GetDefaultAudioEndpoint(flow, ERole.Console, out device) != 0) return "";
            string id; device.GetId(out id); return id;
        }

        public static List<CaptureDevice> List() { return List(EDataFlow.Capture); }

        public static List<CaptureDevice> List(EDataFlow flow)
        {
            var result = new List<CaptureDevice>();
            IMMDeviceCollection collection;
            Marshal.ThrowExceptionForHR(Enumerator().EnumAudioEndpoints(flow, ActiveState, out collection));
            int count; collection.GetCount(out count);
            string defaultId = DefaultId(flow);
            for (int i = 0; i < count; i++)
            {
                IMMDevice device; collection.Item(i, out device);
                string id; device.GetId(out id);
                IPropertyStore store; device.OpenPropertyStore(0, out store);
                var entry = new CaptureDevice();
                entry.Id = id;
                entry.Name = ReadString(store, FriendlyName);
                entry.Interface = ReadString(store, InterfaceName);
                entry.IsDefault = id == defaultId;
                result.Add(entry);
            }
            return result;
        }

        static IMMDevice Device(string id)
        {
            IMMDevice device;
            Marshal.ThrowExceptionForHR(Enumerator().GetDevice(id, out device));
            return device;
        }

        static IAudioEndpointVolume Volume(string id)
        {
            object instance; Guid iid = VolumeInterface;
            Marshal.ThrowExceptionForHR(Device(id).Activate(ref iid, ClsCtxAll, IntPtr.Zero, out instance));
            return (IAudioEndpointVolume)instance;
        }

        public static float GetVolume(string id) { float level; Volume(id).GetMasterVolumeLevelScalar(out level); return level; }
        public static bool GetMute(string id) { bool mute; Volume(id).GetMute(out mute); return mute; }
        public static void SetVolume(string id, float level) { Guid ctx = Guid.Empty; Marshal.ThrowExceptionForHR(Volume(id).SetMasterVolumeLevelScalar(level, ref ctx)); }
        public static void SetMute(string id, bool mute) { Guid ctx = Guid.Empty; Marshal.ThrowExceptionForHR(Volume(id).SetMute(mute, ref ctx)); }

        public static void SetDefault(string id)
        {
            var policy = (IPolicyConfig)new PolicyConfigClient();
            Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, ERole.Console));
            Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, ERole.Multimedia));
            Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, ERole.Communications));
        }

        static Format ReadFormat(IntPtr pointer)
        {
            var format = new Format();
            ushort tag = (ushort)Marshal.ReadInt16(pointer, 0);
            format.Channels = Marshal.ReadInt16(pointer, 2);
            format.Rate = Marshal.ReadInt32(pointer, 4);
            format.Bits = Marshal.ReadInt16(pointer, 14);
            if (tag == 0xFFFE) format.Bits = Marshal.ReadInt16(pointer, 18);
            return format;
        }

        public static Format GetFormat(string id)
        {
            var policy = (IPolicyConfig)new PolicyConfigClient();
            IntPtr pointer;
            Marshal.ThrowExceptionForHR(policy.GetDeviceFormat(id, 0, out pointer));
            try { return ReadFormat(pointer); } finally { Marshal.FreeCoTaskMem(pointer); }
        }

        static IntPtr Build(int bits, int rate, int channels)
        {
            var format = new WaveFormatExtensible();
            format.formatTag = 0xFFFE;
            format.channels = (ushort)channels;
            format.samplesPerSec = (uint)rate;
            int container = bits == 24 ? 32 : bits;
            format.bitsPerSample = (ushort)container;
            format.blockAlign = (ushort)(channels * container / 8);
            format.avgBytesPerSec = (uint)(rate * format.blockAlign);
            format.extraSize = 22;
            format.validBitsPerSample = (ushort)bits;
            format.channelMask = channels == 1 ? 4u : 3u;
            format.subFormat = PcmSubtype;
            IntPtr pointer = Marshal.AllocCoTaskMem(Marshal.SizeOf(format));
            Marshal.StructureToPtr(format, pointer, false);
            return pointer;
        }

        public static bool IsSupported(string id, int bits, int rate, int channels)
        {
            object instance; Guid iid = ClientInterface;
            Marshal.ThrowExceptionForHR(Device(id).Activate(ref iid, ClsCtxAll, IntPtr.Zero, out instance));
            var client = (IAudioClient)instance;
            IntPtr pointer = Build(bits, rate, channels);
            try
            {
                IntPtr closest;
                int hr = client.IsFormatSupported(1, pointer, out closest);
                if (closest != IntPtr.Zero) Marshal.FreeCoTaskMem(closest);
                return hr == 0;
            }
            finally { Marshal.FreeCoTaskMem(pointer); }
        }

        public static void SetFormat(string id, int bits, int rate, int channels)
        {
            var policy = (IPolicyConfig)new PolicyConfigClient();
            IntPtr pointer = Build(bits, rate, channels);
            try { Marshal.ThrowExceptionForHR(policy.SetDeviceFormat(id, pointer, pointer)); }
            finally { Marshal.FreeCoTaskMem(pointer); }
        }
    }

    public static class Effects
    {
        static readonly Guid StoreInterface = new Guid("302AE7F9-D7E0-43E4-971B-1F8293613D2A");
        const int VtEmpty = 0, VtR4 = 4, VtBool = 11, VtUI4 = 19, VtClsid = 72;

        static IRawPropertyStore OpenUserStore(string id, Guid context, uint access)
        {
            IMMDevice device;
            Marshal.ThrowExceptionForHR(((IMMDeviceEnumerator)new MMDeviceEnumerator()).GetDevice(id, out device));
            // The activation parameter is a PROPVARIANT of VT_CLSID naming the context.
            IntPtr guidPointer = Marshal.AllocCoTaskMem(16);
            IntPtr parameter = Marshal.AllocCoTaskMem(24);
            try
            {
                Marshal.Copy(context.ToByteArray(), 0, guidPointer, 16);
                for (int i = 0; i < 24; i++) Marshal.WriteByte(parameter, i, 0);
                Marshal.WriteInt16(parameter, 0, VtClsid);
                Marshal.WriteIntPtr(parameter, 8, guidPointer);
                object instance; Guid iid = StoreInterface;
                Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, parameter, out instance));
                IRawPropertyStore store;
                Marshal.ThrowExceptionForHR(((IAudioSystemEffectsPropertyStore)instance).OpenUserPropertyStore(access, out store));
                return store;
            }
            finally
            {
                Marshal.FreeCoTaskMem(parameter);
                Marshal.FreeCoTaskMem(guidPointer);
            }
        }

        static void FillKey(IntPtr buffer, Guid key, int pid)
        {
            Marshal.Copy(key.ToByteArray(), 0, buffer, 16);
            Marshal.WriteInt32(buffer, 16, pid);
        }

        // Returns one "type:value" string per key: bool:true, float:0.5, uint:3, or empty.
        public static string[] Read(string id, Guid context, Guid[] keys, int[] pids)
        {
            var store = OpenUserStore(id, context, 0);
            var results = new string[keys.Length];
            IntPtr keyBuffer = Marshal.AllocCoTaskMem(24);
            IntPtr valueBuffer = Marshal.AllocCoTaskMem(24);
            try
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    for (int z = 0; z < 24; z++) { Marshal.WriteByte(keyBuffer, z, 0); Marshal.WriteByte(valueBuffer, z, 0); }
                    FillKey(keyBuffer, keys[i], pids[i]);
                    store.GetValue(keyBuffer, valueBuffer);
                    short vt = Marshal.ReadInt16(valueBuffer, 0);
                    int raw = Marshal.ReadInt32(valueBuffer, 8);
                    if (vt == VtBool) results[i] = "bool:" + ((short)raw != 0 ? "true" : "false");
                    else if (vt == VtR4) results[i] = "float:" + BitConverter.ToSingle(BitConverter.GetBytes(raw), 0).ToString(System.Globalization.CultureInfo.InvariantCulture);
                    else if (vt == VtUI4) results[i] = "uint:" + ((uint)raw).ToString();
                    else results[i] = "empty";
                }
            }
            finally
            {
                Marshal.FreeCoTaskMem(keyBuffer);
                Marshal.FreeCoTaskMem(valueBuffer);
            }
            return results;
        }

        public static void Write(string id, Guid context, Guid key, int pid, string type, float value)
        {
            var store = OpenUserStore(id, context, 2);
            IntPtr keyBuffer = Marshal.AllocCoTaskMem(24);
            IntPtr valueBuffer = Marshal.AllocCoTaskMem(24);
            try
            {
                for (int z = 0; z < 24; z++) { Marshal.WriteByte(keyBuffer, z, 0); Marshal.WriteByte(valueBuffer, z, 0); }
                FillKey(keyBuffer, key, pid);
                if (type == "bool")
                {
                    Marshal.WriteInt16(valueBuffer, 0, VtBool);
                    Marshal.WriteInt16(valueBuffer, 8, (short)(value != 0 ? -1 : 0));
                }
                else
                {
                    Marshal.WriteInt16(valueBuffer, 0, VtR4);
                    Marshal.WriteInt32(valueBuffer, 8, BitConverter.ToInt32(BitConverter.GetBytes(value), 0));
                }
                Marshal.ThrowExceptionForHR(store.SetValue(keyBuffer, valueBuffer));
                Marshal.ThrowExceptionForHR(store.Commit());
            }
            finally
            {
                Marshal.FreeCoTaskMem(keyBuffer);
                Marshal.FreeCoTaskMem(valueBuffer);
            }
        }
    }
}
'@

function Respond($object) {
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 4 $object))
    [Console]::Out.Flush()
}

function Handle($request) {
    switch ($request.op) {
        'list' { return @{ devices = @([PebbleAudio.Capture]::List() | ForEach-Object { @{ id = $_.Id; name = $_.Name; interface = $_.Interface; isDefault = $_.IsDefault } }) } }
        'list-render' { return @{ devices = @([PebbleAudio.Capture]::List([PebbleAudio.EDataFlow]::Render) | ForEach-Object { @{ id = $_.Id; name = $_.Name; interface = $_.Interface; isDefault = $_.IsDefault } }) } }
        'effects-get' {
            $keys = [Guid[]]@($request.keys | ForEach-Object { [Guid]$_.guid })
            $pids = [int[]]@($request.keys | ForEach-Object { [int]$_.pid })
            $raw = [PebbleAudio.Effects]::Read($request.id, [Guid]$request.context, $keys, $pids)
            $values = @{}
            for ($i = 0; $i -lt $raw.Length; $i++) { $values[$request.keys[$i].name] = $raw[$i] }
            return @{ values = $values }
        }
        'effects-set' {
            [PebbleAudio.Effects]::Write($request.id, [Guid]$request.context, [Guid]$request.guid, [int]$request.pid, [string]$request.type, [float]$request.value)
            return @{ ok = $true }
        }
        'state' {
            $format = [PebbleAudio.Capture]::GetFormat($request.id)
            return @{
                volume = [Math]::Round([PebbleAudio.Capture]::GetVolume($request.id) * 100)
                muted = [PebbleAudio.Capture]::GetMute($request.id)
                format = @{ bits = $format.Bits; rate = $format.Rate; channels = $format.Channels }
            }
        }
        'set-volume' { [PebbleAudio.Capture]::SetVolume($request.id, [float]($request.volume / 100)); return @{ ok = $true } }
        'set-mute' { [PebbleAudio.Capture]::SetMute($request.id, [bool]$request.muted); return @{ ok = $true } }
        'set-default' { [PebbleAudio.Capture]::SetDefault($request.id); return @{ ok = $true } }
        'formats' {
            $supported = @()
            foreach ($candidate in $request.candidates) {
                if ([PebbleAudio.Capture]::IsSupported($request.id, [int]$candidate.bits, [int]$candidate.rate, [int]$candidate.channels)) {
                    $supported += @{ bits = $candidate.bits; rate = $candidate.rate; channels = $candidate.channels }
                }
            }
            return @{ formats = $supported }
        }
        'set-format' { [PebbleAudio.Capture]::SetFormat($request.id, [int]$request.bits, [int]$request.rate, [int]$request.channels); return @{ ok = $true } }
        'ping' { return @{ ok = $true } }
        default { throw "Unknown operation $($request.op)" }
    }
}

Respond @{ ready = $true }
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim() -eq '') { continue }
    try {
        $request = ConvertFrom-Json $line
        $result = Handle $request
        Respond @{ seq = $request.seq; result = $result }
    } catch {
        Respond @{ seq = $request.seq; error = $_.Exception.GetBaseException().Message }
    }
}
