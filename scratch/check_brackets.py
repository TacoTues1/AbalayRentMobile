
def check_balancing(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    brackets = {'{': '}', '(': ')', '[': ']'}
    reverse_brackets = {v: k for k, v in brackets.items()}
    
    line = 1
    col = 1
    
    in_string = False
    string_char = ''
    escaped = False
    
    in_comment = False
    comment_type = '' # '//' or '/*'
    
    for i, char in enumerate(content):
        if escaped:
            escaped = False
            continue
            
        if in_string:
            if char == '\\':
                escaped = True
            elif char == string_char:
                in_string = False
            continue
            
        if in_comment:
            if comment_type == '//' and char == '\n':
                in_comment = False
            elif comment_type == '/*' and content[i:i+2] == '*/':
                in_comment = False
            continue
            
        if char == '"' or char == "'" or char == '`':
            in_string = True
            string_char = char
            continue
            
        if content[i:i+2] == '//':
            in_comment = True
            comment_type = '//'
            continue
            
        if content[i:i+2] == '/*':
            in_comment = True
            comment_type = '/*'
            continue
            
        if char in brackets:
            stack.append((char, line, col))
        elif char in reverse_brackets:
            if not stack:
                print(f"Unmatched {char} at line {line}, col {col}")
                return
            top, l, c = stack.pop()
            if top != reverse_brackets[char]:
                print(f"Mismatched {char} at line {line}, col {col} (matches {top} from line {l}, col {c})")
                return
        
        if char == '\n':
            line += 1
            col = 1
        else:
            col += 1
            
    if stack:
        for char, l, c in stack:
            print(f"Unclosed {char} from line {l}, col {c}")
    else:
        print("Everything is balanced!")

check_balancing('c:/Users/Alfonz/Desktop/Files/Codes/Abalay Rent Mobile/components/auth/dashboard/LandlordDashboard.tsx')
