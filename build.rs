use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Tell Cargo to rerun this build script if the source files change
    println!("cargo:rerun-if-changed=src/interfaces/api/mod.rs");
    println!("cargo:rerun-if-changed=src/interfaces/api/handlers");
    println!("cargo:rerun-if-changed=src/bin/generate-openapi.rs");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());

    // Check if the binary already exists (from a previous build)
    let binary_name = if cfg!(target_os = "windows") {
        "generate-openapi.exe"
    } else {
        "generate-openapi"
    };

    let binary_path = manifest_dir.join("target").join(&profile).join(binary_name);

    // If binary exists, try to run it
    if binary_path.exists() {
        let output = Command::new(&binary_path)
            .current_dir(&manifest_dir)
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                println!("cargo:warning=OpenAPI spec generated successfully at resources/gen/openapi.json");
                return;
            }
        }
    }

    // If binary doesn't exist or failed to run, try to build it
    // This might fail on first build, which is OK
    let build_output = Command::new("cargo")
        .args(&["build", "--bin", "generate-openapi"])
        .arg("--profile")
        .arg(&profile)
        .current_dir(&manifest_dir)
        .output();

    if let Ok(output) = build_output {
        if output.status.success() && binary_path.exists() {
            // Try running it again
            if let Ok(run_output) = Command::new(&binary_path)
                .current_dir(&manifest_dir)
                .output()
            {
                if run_output.status.success() {
                    println!("cargo:warning=OpenAPI spec generated successfully at resources/gen/openapi.json");
                }
            }
        }
    }

    // Note: If this is the first build, the binary won't exist yet.
    // Run 'cargo run --bin generate-openapi' manually or it will be generated on the next build.
    // The spec will be saved to resources/gen/openapi.json
}
