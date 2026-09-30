import json
import re
import os
import argparse
from collections import defaultdict
import logging  # Import the logging module

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')


def parse_value(value_str):
    """Attempts to convert a string known to be numeric to float or int."""
    try:
        # Try float first to handle decimals correctly
        f_val = float(value_str)
        # Check if it's an integer disguised as float (e.g., "1.0")
        if f_val.is_integer():
            return int(f_val)
        return f_val
    except ValueError:
        # Should ideally not happen if pre-check is done, but as fallback
        try:
            return int(value_str)
        except ValueError:
            return value_str  # Fallback: should not be reached with pre-check


def is_strict_numeric_string(s):
    """Checks if a string represents a valid integer or float using regex."""
    s = s.strip()
    if not s:
        return False
    pattern = r'^-?(?:\d+(?:\.\d*)?|\.\d+)$'
    return bool(re.fullmatch(pattern, s))


def preprocess_lines(raw_lines):
    """Removes comments and prepares braced content."""
    content = "".join(raw_lines)

    # Remove comments first
    lines_no_comments = [line for line in content.splitlines() if not line.strip().startswith('#')]
    content_no_comments = "\n".join(lines_no_comments)

    # Process multi-line {...} blocks: replace internal newlines/spaces, keep braces
    def replace_braces(match):
        inner_content = match.group(1)
        # Replace internal whitespace (including newlines) with single spaces
        processed_content = ' '.join(inner_content.split())
        # Return content wrapped in braces (add space padding for safety)
        return f"{{ {processed_content} }}"  # Keep literal braces

    # Using non-greedy match, DOTALL allows . to match newlines
    content_processed = re.sub(r'{\s*(.*?)\s*}', replace_braces, content_no_comments, flags=re.DOTALL)

    return content_processed.splitlines()


def parse_block(lines, index, current_indent):
    """Recursively parses a block defined by $KEYWORD ... $END."""
    start_line = lines[index]
    # Handle potential extra spaces before keyword
    keyword = start_line.strip().split()[0][1:]  # Remove $
    data = defaultdict(list)  # Use defaultdict to handle multiple entries easily
    i = index + 1

    while i < len(lines):
        line = lines[i]
        if not line.strip():  # Skip empty lines
            i += 1
            continue

        indent = len(line) - len(line.lstrip(' '))
        stripped_line = line.lstrip()

        # Check for the end of the current block
        if stripped_line == '$END' and indent == current_indent:
            # Finalize data: convert single-item lists back to items
            final_data = {}
            for k, v_list in data.items():
                if len(v_list) == 1:
                    final_data[k] = v_list[0]
                else:
                    final_data[k] = v_list
            return keyword, final_data, i + 1

        # Check indentation relative to the current block
        if indent > current_indent:
            # Potential key-value or sub-block within the current block
            if stripped_line.startswith('$'):
                parts = stripped_line.split(':', 1)
                if len(parts) == 2 and not parts[0].strip() == '$END':  # Key-value pair
                    key = parts[0].strip()[1:]  # Remove $
                    value_part = parts[1].strip()
                    value_lines_str = [value_part] if value_part else []  # Start with first line's value part

                    # --- Check for continuation lines ---
                    k = i + 1
                    key_line_indent = indent  # Indentation of the $KEY: VAL line

                    while k < len(lines):
                        next_line = lines[k]
                        next_indent = len(next_line) - len(next_line.lstrip(' '))
                        stripped_next = next_line.lstrip()

                        # Continuation Check:
                        # 1. Line is not empty.
                        # 2. Line does not start with '$' (after stripping).
                        # 3. Indentation is >= the key's indentation level.
                        if stripped_next and not stripped_next.startswith('$') and next_indent >= key_line_indent:
                            value_lines_str.append(next_line.strip())
                            k += 1
                        else:
                            break  # Stop continuation
                    i = k - 1  # Update outer loop index to last processed line
                    # --- End Continuation Check ---

                    # --- Parse the collected value lines (Revised Logic) ---
                    parsed_value_lines = []
                    # Combine all value lines first
                    full_value_str = " ".join(value_lines_str).strip()

                    # Check for literal braced content {}
                    if full_value_str.startswith("{") and full_value_str.endswith("}"):
                        # Extract content between braces
                        content_between_braces = full_value_str[1:-1].strip()
                        # Split into a list, filter out empty strings
                        parsed_parts = [part for part in content_between_braces.split() if part]
                        # Store as a list
                        parsed_value_lines.append(parsed_parts)
                    else:
                        # Original logic for non-braced content (process line by line)
                        for v_line_str in value_lines_str:
                            if not v_line_str:
                                continue  # Skip empty value parts
                            stripped_v_line = v_line_str.strip()
                            if not stripped_v_line:
                                continue  # Skip lines that become empty after stripping

                            line_parts = stripped_v_line.split()

                            # Check if ALL parts are strictly numeric
                            all_strict_numeric = True
                            if not line_parts:
                                all_strict_numeric = False
                            else:
                                for part in line_parts:
                                    # Use the new regex check function
                                    if not is_strict_numeric_string(part):
                                        all_strict_numeric = False
                                        break

                            if all_strict_numeric:
                                # Parse all parts as numbers
                                parsed_parts = [parse_value(p) for p in line_parts]
                                if len(parsed_parts) == 1:
                                    parsed_value_lines.append(parsed_parts[0])  # Single number on line
                                else:
                                    parsed_value_lines.append(parsed_parts)  # List of numbers on line
                            else:
                                # Treat the whole line as a single string (unescaping specific chars)
                                unescaped_line = re.sub(r'\\([()\[\] ])', r'\1', stripped_v_line)
                                parsed_value_lines.append(unescaped_line)
                    # --- End Revised Value Parsing ---

                    # Determine final value representation for the key
                    if not parsed_value_lines:
                        final_value = None  # Or ""? Let's use None for empty values
                    elif len(parsed_value_lines) == 1:  # Corrected: Check length of the list
                        final_value = parsed_value_lines[0]  # Single line value (string, number, or list of numbers)
                    else:
                        final_value = parsed_value_lines  # Multi-line value -> list of [string/number/list]

                    data[key].append(final_value)  # Append to list in defaultdict

                elif stripped_line.startswith('$') and not stripped_line == '$END':  # Sub-block
                    sub_keyword, sub_data, next_i = parse_block(lines, i, indent)
                    data[sub_keyword].append(sub_data)  # Append sub-block data
                    i = next_i - 1  # Update outer loop index
                # else: $END of a sub-block (ignore, handled by recursive return) or malformed line
            # else: Line inside block but not starting with $, could be continuation (handled above) or noise. Ignore noise.
        elif indent < current_indent:
            # This line belongs to a parent block, signifies the end of the current block implicitly (though $END is expected)
            break  # Exit the loop for this block

        i += 1

    # If loop finishes without finding $END (e.g., EOF reached)
    # Finalize data similarly to the $END case
    final_data = {}
    for k, v_list in data.items():
        if len(v_list) == 1:
            final_data[k] = v_list[0]
        else:
            final_data[k] = v_list
    return keyword, final_data, i  # Return index i (which might be len(lines)


def main(input_path, output_dir):
    """Parses the PRJ file and writes JSON outputs."""
    try:
        # Try reading with UTF-8 first
        with open(input_path, 'r', encoding='utf-8') as f:
            raw_lines = f.readlines()
    except UnicodeDecodeError:
        logging.warning(f"Could not decode {input_path} as UTF-8. Trying Latin-1.")
        try:
            # Fallback to Latin-1
            with open(input_path, 'r', encoding='latin-1') as f:
                raw_lines = f.readlines()
        except Exception as e:
            logging.error(f"Error reading file {input_path} even with Latin-1: {e}")
            return
    except FileNotFoundError:
        logging.error(f"Input file not found at {input_path}")
        return
    except Exception as e:
        logging.error(f"Error reading file {input_path}: {e}")
        return

    lines = preprocess_lines(raw_lines)

    top_level_collector = defaultdict(list)
    i = 0
    # --- Define blocks to skip --- 
    blocks_to_skip = {'CONTROL_POINTS', 'BLOCK', 'AAT', 'NAVIGATION'}
    skipped_blocks_found = set()
    # --- End Define --- 

    while i < len(lines):
        line = lines[i]
        if not line.strip():  # Skip empty lines
            i += 1
            continue

        indent = len(line) - len(line.lstrip(' '))
        stripped_line = line.lstrip()

        # Look for top-level blocks (indentation 0)
        if indent == 0 and stripped_line.startswith('$') and not stripped_line == '$END':
            keyword = stripped_line.split()[0][1:]  # Extract keyword

            # --- Skip specified blocks --- 
            if keyword in blocks_to_skip:
                logging.info(f"Skipping ${keyword} block as requested.")
                skipped_blocks_found.add(keyword) # Track which ones were actually skipped
                # Find the corresponding $END
                start_block_line = i
                i += 1
                while i < len(lines):
                    end_line = lines[i]
                    end_indent = len(end_line) - len(end_line.lstrip(' '))
                    stripped_end_line = end_line.lstrip()
                    if end_indent == 0 and stripped_end_line == '$END':
                        i += 1  # Move past the $END line
                        break
                    i += 1
                else:
                    # $END not found before EOF, log warning
                    logging.warning(f"$END not found for ${keyword} block starting at line {start_block_line + 1}. Reached end of file.")
                continue  # Continue to next line after skipping
            # --- End Skip --- 

            try:
                # Pass the already extracted keyword
                keyword, block_data, next_i = parse_block(lines, i, indent)
                top_level_collector[keyword].append(block_data)
                i = next_i  # Continue parsing from where the block ended
            except Exception as e:
                logging.error(f"Error parsing block starting at line {i+1}: {line.strip()}")
                logging.error(f"  Error details: {e}")
                # Attempt to recover by skipping to the next potential top-level block
                i += 1
        else:
            # Skip lines that are not starting top-level blocks
            i += 1

    # Finalize structure: if only one block for a keyword, don't use a list
    final_output_data = {}
    for keyword, data_list in top_level_collector.items():
        if len(data_list) == 1:
            final_output_data[keyword] = data_list[0]
        else:
            final_output_data[keyword] = data_list

    # Write output files
    os.makedirs(output_dir, exist_ok=True)
    logging.info(f"Writing JSON files to: {os.path.abspath(output_dir)}")
    if skipped_blocks_found:
        logging.info(f"Note: The following blocks were skipped during parsing: {', '.join(sorted(list(skipped_blocks_found)))}") # Update note about skipping
    for keyword, data in final_output_data.items():
        # Sanitize keyword for filename if necessary (though current examples look safe)
        filename_keyword = re.sub(r'[^\w\-]+', '_', keyword)  # Basic sanitization
        output_filename = os.path.join(output_dir, f"{filename_keyword}.json")
        try:
            with open(output_filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except TypeError as e:
            logging.error(f"Error writing JSON for {keyword}: Non-serializable data encountered.")
        except Exception as e:
            logging.error(f"Error writing JSON file {output_filename}: {e}")


if __name__ == "__main__":
    # Setup argument parser if running as a script
    parser = argparse.ArgumentParser(description="Parse Inpho PRJ file to JSON.")
    parser.add_argument("input_file", help="Path to the input .prj file.")
    parser.add_argument("output_dir", help="Directory to save the output JSON files.")
    parser.add_argument("-v", "--verbose", help="Increase output verbosity (DEBUG level)", action="store_true")
    args = parser.parse_args()

    # Adjust logging level based on verbose flag
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    main(args.input_file, args.output_dir)