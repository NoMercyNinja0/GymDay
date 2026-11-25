#!/usr/bin/env python3
"""Writes GymDay.xcodeproj for GymDay's iPhone app: the app, its widgets (home screen, Control Center and the running workout
on the Lock Screen) and its Share extension (photos shared from Photos). Every .swift file in a target's folders is put in that
target, so after adding or removing a file run this again:  python3 tools/gen_project.py
The ids inside the project file come from the file names, so running it again gives the same file."""
import hashlib, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION, BUILD = '1.35.2', '60'
# The Apple developer team that signs GymDay (Debug and Release): GYMDAY_TEAM=<Team ID>. Empty = pick a team in Xcode's
# Signing & Capabilities.
TEAM = os.environ.get('GYMDAY_TEAM', '')
# The root of the bundle IDs and the App Group: GYMDAY_ID=com.yourname.gymday (Debug adds .dev). Empty = GymDay's own IDs.
GD_ID = os.environ.get('GYMDAY_ID', '').strip()
DEPLOY = '18.0'


def gid(*parts):
    return hashlib.md5('|'.join(parts).encode()).hexdigest()[:24].upper()


def q(s):
    """A value as the project file writes it: bare when it is safe, otherwise in quotes."""
    s = str(s)
    if s and all(c.isalnum() or c in '._/' for c in s) and not s.startswith('_'):
        return s
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


TARGETS = [
    {'name': 'GymDay', 'type': 'app', 'srcs': ['App', 'Shared'], 'bundle': '$(GD_ROOT)', 'plist': 'App/Info.plist', 'ent': 'App/GymDay.entitlements',
     'res': ['App/Assets.xcassets', 'App/ios-bridge.js', 'App/PrivacyInfo.xcprivacy', 'www'], 'embed': ['GymDayWidgets', 'GymDayShare']},
    {'name': 'GymDayWidgets', 'type': 'ext', 'srcs': ['Widgets', 'Shared'], 'bundle': '$(GD_ROOT).widgets', 'plist': 'Widgets/Info.plist',
     'ent': 'Widgets/GymDayWidgets.entitlements', 'res': ['Widgets/Assets.xcassets', 'Widgets/PrivacyInfo.xcprivacy'], 'embed': []},
    {'name': 'GymDayShare', 'type': 'ext', 'srcs': ['Share', 'Shared/AppGroup.swift'], 'bundle': '$(GD_ROOT).share', 'plist': 'Share/Info.plist',
     'ent': 'Share/GymDayShare.entitlements', 'res': ['Share/PrivacyInfo.xcprivacy'], 'embed': []},
]

KIND = {'.swift': 'sourcecode.swift', '.plist': 'text.plist.xml', '.entitlements': 'text.plist.entitlements', '.js': 'sourcecode.javascript',
        '.xcassets': 'folder.assetcatalog', '.xcprivacy': 'text.xml', '.md': 'net.daringfireball.markdown'}


def swift_files(spec):
    out = []
    for s in spec:
        p = os.path.join(ROOT, s)
        if os.path.isfile(p):
            out.append(s)
            continue
        for dp, dns, fns in os.walk(p):
            dns[:] = sorted(d for d in dns if not d.endswith('.xcassets'))
            for f in sorted(fns):
                if f.endswith('.swift'):
                    out.append(os.path.relpath(os.path.join(dp, f), ROOT))
    return sorted(set(out))


objs = {}          # id -> (isa, body lines)


def obj(i, isa, **kv):
    objs[i] = (isa, kv)
    return i


PROJ = gid('project')
files = {}         # path -> file ref id


def fref(path):
    if path in files:
        return files[path]
    ext = os.path.splitext(path)[1]
    i = gid('file', path)
    if path == 'www':
        obj(i, 'PBXFileReference', lastKnownFileType='folder', path='www', sourceTree='<group>')
    else:
        obj(i, 'PBXFileReference', lastKnownFileType=KIND.get(ext, 'file'), path=os.path.basename(path), sourceTree='<group>')
    files[path] = i
    return i


prod = {}
tids = {}
for t in TARGETS:
    tids[t['name']] = gid('target', t['name'])
    pi = gid('product', t['name'])
    if t['type'] == 'app':
        obj(pi, 'PBXFileReference', explicitFileType='wrapper.application', includeInIndex='0', path=t['name'] + '.app', sourceTree='BUILT_PRODUCTS_DIR')
    else:
        obj(pi, 'PBXFileReference', explicitFileType='"wrapper.app-extension"', includeInIndex='0', path=t['name'] + '.appex', sourceTree='BUILT_PRODUCTS_DIR')
    prod[t['name']] = pi

# every file the targets use, and the groups that mirror the folders
all_paths = set()
for t in TARGETS:
    for f in swift_files(t['srcs']):
        all_paths.add(f)
    all_paths.update(t['res'])
    all_paths.update([t['plist'], t['ent']])
for extra in ['README.md']:
    if os.path.exists(os.path.join(ROOT, extra)):
        all_paths.add(extra)
for p in sorted(all_paths):
    fref(p)

groups = {}        # folder -> list of child ids


def add_to_group(path, child):
    folder = os.path.dirname(path)
    groups.setdefault(folder, [])
    if child not in groups[folder]:
        groups[folder].append(child)
    if folder:
        gi = gid('group', folder)
        add_to_group(folder, gi)


for p in sorted(all_paths):
    add_to_group(p, files[p])
for folder, kids in groups.items():
    if not folder:
        continue
    obj(gid('group', folder), 'PBXGroup', children=kids, path=os.path.basename(folder), sourceTree='<group>')
PRODUCTS = obj(gid('group', '#products'), 'PBXGroup', children=[prod[t['name']] for t in TARGETS], name='Products', sourceTree='<group>')
order = ['App', 'Widgets', 'Share', 'Shared', 'www', 'README.md']
top = sorted(groups[''], key=lambda i: next((n for n, k in enumerate(order) if (k in files and files[k] == i) or gid('group', k) == i), 99))
MAIN = obj(gid('group', '#main'), 'PBXGroup', children=top + [PRODUCTS], sourceTree='<group>')

COMMON = {
    'ALWAYS_SEARCH_USER_PATHS': 'NO', 'ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS': 'YES', 'CLANG_ANALYZER_NONNULL': 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD': 'gnu++20', 'CLANG_ENABLE_MODULES': 'YES', 'CLANG_ENABLE_OBJC_ARC': 'YES', 'CLANG_ENABLE_OBJC_WEAK': 'YES',
    'COPY_PHASE_STRIP': 'NO', 'ENABLE_STRICT_OBJC_MSGSEND': 'YES', 'ENABLE_USER_SCRIPT_SANDBOXING': 'YES', 'GCC_C_LANGUAGE_STANDARD': 'gnu17',
    'GCC_NO_COMMON_BLOCKS': 'YES', 'IPHONEOS_DEPLOYMENT_TARGET': DEPLOY, 'LOCALIZATION_PREFERS_STRING_CATALOGS': 'YES', 'MTL_FAST_MATH': 'YES',
    'SDKROOT': 'iphoneos', 'SWIFT_VERSION': '5.0',
}
# Xcode 27.2's "Update to recommended settings" (accepted 21 Nov): its recommended compiler warnings and String Catalog symbols
COMMON.update({k: 'YES' for k in '''CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING CLANG_WARN_BOOL_CONVERSION CLANG_WARN_COMMA
    CLANG_WARN_CONSTANT_CONVERSION CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS CLANG_WARN_EMPTY_BODY CLANG_WARN_ENUM_CONVERSION
    CLANG_WARN_INFINITE_RECURSION CLANG_WARN_INT_CONVERSION CLANG_WARN_NON_LITERAL_NULL_CONVERSION CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF
    CLANG_WARN_OBJC_LITERAL_CONVERSION CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER CLANG_WARN_RANGE_LOOP_ANALYSIS
    CLANG_WARN_STRICT_PROTOTYPES CLANG_WARN_SUSPICIOUS_MOVE CLANG_WARN_UNREACHABLE_CODE CLANG_WARN__DUPLICATE_METHOD_MATCH
    GCC_WARN_64_TO_32_BIT_CONVERSION GCC_WARN_ABOUT_RETURN_TYPE GCC_WARN_UNDECLARED_SELECTOR GCC_WARN_UNINITIALIZED_AUTOS
    GCC_WARN_UNUSED_FUNCTION GCC_WARN_UNUSED_VARIABLE STRING_CATALOG_GENERATE_SYMBOLS'''.split()})
# GD_ROOT is where the bundle IDs and the App Group come from. Debug (Xcode's Run, on the Simulator or your own iPhone) uses
# app.gymday.dev, so testing with a free Apple Account (a Personal Team) never registers the store's IDs to that team, which
# would block the paid account from registering them for about 7 days. Release (Product > Archive, for TestFlight and the
# App Store) uses app.gymday, the IDs the stores know.
DEBUG = dict(COMMON, GD_ROOT=(GD_ID + '.dev') if GD_ID else 'app.gymday.dev', DEBUG_INFORMATION_FORMAT='dwarf', ENABLE_TESTABILITY='YES', GCC_DYNAMIC_NO_PIC='NO', GCC_OPTIMIZATION_LEVEL='0',
             GCC_PREPROCESSOR_DEFINITIONS=['DEBUG=1', '$(inherited)'], MTL_ENABLE_DEBUG_INFO='INCLUDE_SOURCE', ONLY_ACTIVE_ARCH='YES',
             SWIFT_ACTIVE_COMPILATION_CONDITIONS='DEBUG $(inherited)', SWIFT_OPTIMIZATION_LEVEL='-Onone')
RELEASE = dict(COMMON, GD_ROOT=GD_ID or 'app.gymday', DEBUG_INFORMATION_FORMAT='dwarf-with-dsym', ENABLE_NS_ASSERTIONS='NO', MTL_ENABLE_DEBUG_INFO='NO',
               SWIFT_COMPILATION_MODE='wholemodule', VALIDATE_PRODUCT='YES')


def conf_list(owner, debug, release, default='Release'):
    d = obj(gid('conf', owner, 'Debug'), 'XCBuildConfiguration', buildSettings=debug, name='Debug')
    r = obj(gid('conf', owner, 'Release'), 'XCBuildConfiguration', buildSettings=release, name='Release')
    return obj(gid('conflist', owner), 'XCConfigurationList', buildConfigurations=[d, r], defaultConfigurationIsVisible='0', defaultConfigurationName=default)


def target_settings(t):
    s = {
        'CODE_SIGN_ENTITLEMENTS': t['ent'], 'CODE_SIGN_STYLE': 'Automatic', 'CURRENT_PROJECT_VERSION': BUILD, 'DEVELOPMENT_TEAM': TEAM,
        'GENERATE_INFOPLIST_FILE': 'NO', 'INFOPLIST_FILE': t['plist'], 'MARKETING_VERSION': VERSION, 'PRODUCT_BUNDLE_IDENTIFIER': t['bundle'],
        'PRODUCT_NAME': '$(TARGET_NAME)', 'SUPPORTED_PLATFORMS': 'iphoneos iphonesimulator', 'SUPPORTS_MACCATALYST': 'NO',
        'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD': 'NO', 'SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD': 'NO', 'SWIFT_EMIT_LOC_STRINGS': 'NO',
        'TARGETED_DEVICE_FAMILY': '1', 'ENABLE_PREVIEWS': 'NO',
        # the iPhone Simulator needs no Apple developer account: Xcode signs for it on this Mac ("Sign to Run Locally")
        'CODE_SIGN_IDENTITY[sdk=iphonesimulator*]': '-',
    }
    if t['type'] == 'app':
        s.update({'ASSETCATALOG_COMPILER_APPICON_NAME': 'AppIcon', 'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME': 'AccentColor',
                  'LD_RUNPATH_SEARCH_PATHS': ['$(inherited)', '@executable_path/Frameworks']})
    else:
        s.update({'SKIP_INSTALL': 'YES', 'APPLICATION_EXTENSION_API_ONLY': 'YES',
                  'LD_RUNPATH_SEARCH_PATHS': ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']})
        if t['name'] == 'GymDayWidgets':
            s.update({'ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME': 'AccentColor', 'ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME': 'WidgetBackground'})
    return s


target_attrs = {}
for t in TARGETS:
    n = t['name']
    src = obj(gid('phase', n, 'sources'), 'PBXSourcesBuildPhase', buildActionMask='2147483647',
              files=[obj(gid('bf', n, f), 'PBXBuildFile', fileRef=files[f], _comment=os.path.basename(f) + ' in Sources') for f in swift_files(t['srcs'])],
              runOnlyForDeploymentPostprocessing='0')
    fw = obj(gid('phase', n, 'frameworks'), 'PBXFrameworksBuildPhase', buildActionMask='2147483647', files=[], runOnlyForDeploymentPostprocessing='0')
    res = obj(gid('phase', n, 'resources'), 'PBXResourcesBuildPhase', buildActionMask='2147483647',
              files=[obj(gid('bf', n, f), 'PBXBuildFile', fileRef=files[f], _comment=os.path.basename(f) + ' in Resources') for f in t['res']],
              runOnlyForDeploymentPostprocessing='0')
    phases = [src, fw, res]
    deps = []
    if t['embed']:
        emb = []
        for e in t['embed']:
            emb.append(obj(gid('bf', n, 'embed', e), 'PBXBuildFile', fileRef=prod[e], settings={'ATTRIBUTES': ['RemoveHeadersOnCopy']},
                           _comment=e + '.appex in Embed Foundation Extensions'))
            px = obj(gid('proxy', n, e), 'PBXContainerItemProxy', containerPortal=PROJ, proxyType='1', remoteGlobalIDString=tids[e], remoteInfo=e)
            deps.append(obj(gid('dep', n, e), 'PBXTargetDependency', target=tids[e], targetProxy=px))
        phases.append(obj(gid('phase', n, 'embed'), 'PBXCopyFilesBuildPhase', buildActionMask='2147483647', dstPath='""', dstSubfolderSpec='13',
                          files=emb, name='"Embed Foundation Extensions"', runOnlyForDeploymentPostprocessing='0'))
    ts = target_settings(t)
    cl = conf_list('target:' + n, ts, ts)
    obj(tids[n], 'PBXNativeTarget', buildConfigurationList=cl, buildPhases=phases, buildRules=[], dependencies=deps, name=n,
        productName=n, productReference=prod[n],
        productType='"com.apple.product-type.application"' if t['type'] == 'app' else '"com.apple.product-type.app-extension"')
    target_attrs[tids[n]] = {'CreatedOnToolsVersion': '27.0'}

obj(PROJ, 'PBXProject', attributes={'BuildIndependentTargetsInParallel': '1', 'LastSwiftUpdateCheck': '2700', 'LastUpgradeCheck': '2720',
                                    'TargetAttributes': target_attrs},
    buildConfigurationList=conf_list('project', DEBUG, RELEASE), compatibilityVersion='"Xcode 14.0"', developmentRegion='en',
    hasScannedForEncodings='0', knownRegions=['en', 'Base'], mainGroup=MAIN, productRefGroup=PRODUCTS, projectDirPath='""', projectRoot='""',
    targets=[tids[t['name']] for t in TARGETS])


def val(v, ind):
    pad = '\t' * ind
    if isinstance(v, dict):
        inner = ''.join(f'{pad}\t{q(k)} = {val(x, ind + 1)};\n' for k, x in v.items())
        return '{\n' + inner + pad + '}'
    if isinstance(v, list):
        if not v:
            return '(\n' + pad + ')'
        return '(\n' + ''.join(f'{pad}\t{val(x, ind + 1)},\n' for x in v) + pad + ')'
    v = str(v)
    if v.startswith('"') and v.endswith('"'):
        return v
    return q(v)


out = ['// !$*UTF8*$!', '{', '\tarchiveVersion = 1;', '\tclasses = {', '\t};', '\tobjectVersion = 56;', '\tobjects = {', '']
for isa in sorted(set(i[0] for i in objs.values())):
    out.append(f'/* Begin {isa} section */')
    for i in sorted(k for k, o in objs.items() if o[0] == isa):
        kv = dict(objs[i][1])
        kv.pop('_comment', None)
        if isa in ('PBXBuildFile', 'PBXFileReference'):
            body = ' '.join(f'{q(k)} = {val(x, 0)};' for k, x in [('isa', isa)] + list(kv.items()))
            out.append(f'\t\t{i} = {{{body} }};')
        else:
            out.append(f'\t\t{i} = {{')
            out.append(f'\t\t\tisa = {isa};')
            for k, x in kv.items():
                out.append(f'\t\t\t{q(k)} = {val(x, 3)};')
            out.append('\t\t};')
    out.append(f'/* End {isa} section */')
    out.append('')
out += ['\t};', f'\trootObject = {PROJ};', '}', '']

pdir = os.path.join(ROOT, 'GymDay.xcodeproj')
os.makedirs(os.path.join(pdir, 'xcshareddata', 'xcschemes'), exist_ok=True)
os.makedirs(os.path.join(pdir, 'project.xcworkspace'), exist_ok=True)
open(os.path.join(pdir, 'project.pbxproj'), 'w').write('\n'.join(out))
open(os.path.join(pdir, 'project.xcworkspace', 'contents.xcworkspacedata'), 'w').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<Workspace\n   version = "1.0">\n   <FileRef\n      location = "self:">\n   </FileRef>\n</Workspace>\n')

# Builds (and their logs) go to DerivedData/ next to the project, so the build log can be read from the project folder.
WS = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>BuildLocationStyle</key>
	<string>UseAppPreferences</string>
	<key>CustomBuildLocationType</key>
	<string>RelativeToDerivedData</string>
	<key>DerivedDataCustomLocation</key>
	<string>DerivedData</string>
	<key>DerivedDataLocationStyle</key>
	<string>WorkspaceRelativePath</string>
</dict>
</plist>
"""
for sub in ['xcshareddata'] + [f'xcuserdata/{u}.xcuserdatad' for u in os.environ.get('XCODE_USERS', 'venu').split(',') if u]:
    d = os.path.join(pdir, 'project.xcworkspace', sub)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'WorkspaceSettings.xcsettings'), 'w').write(WS)

ref = f'''<BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "{tids['GymDay']}"
               BuildableName = "GymDay.app"
               BlueprintName = "GymDay"
               ReferencedContainer = "container:GymDay.xcodeproj">
            </BuildableReference>'''
scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "2700"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            {ref}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         {ref}
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
'''
open(os.path.join(pdir, 'xcshareddata', 'xcschemes', 'GymDay.xcscheme'), 'w').write(scheme)
print('wrote', os.path.relpath(pdir, ROOT), '-', len(objs), 'objects,', sum(len(swift_files(t['srcs'])) for t in TARGETS), 'swift files in targets')
