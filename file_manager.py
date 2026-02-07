import os

def list_files(start_path, output_file):
    with open(output_file, "w", encoding="utf-8") as f:
        for root, dirs, files in os.walk(start_path):
            # Get indentation level
            level = root.replace(start_path, "").count(os.sep)
            indent = "    " * level
            f.write(f"{indent}{os.path.basename(root)}/\n")
            
            sub_indent = "    " * (level + 1)
            for file in files:
                f.write(f"{sub_indent}{file}\n")

# Example usage:
list_files("/home/asp/projects/autopilot/", "project_map.txt")
